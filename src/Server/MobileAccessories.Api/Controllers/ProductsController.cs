using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using MobileAccessories.Api.Data;
using MobileAccessories.Api.DTOs;
using MobileAccessories.Api.Models;
using MobileAccessories.Api.Security;
using MobileAccessories.Api.Services;

namespace MobileAccessories.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/[controller]")]
public sealed class ProductsController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly ProductBarcodeGenerator _barcodeGenerator;

    public ProductsController(AppDbContext context, ProductBarcodeGenerator barcodeGenerator)
    {
        _context = context;
        _barcodeGenerator = barcodeGenerator;
    }

    // GET /api/products?search=charger&page=1&pageSize=20&sortBy=name&sortDirection=asc
    [HttpGet]
    public async Task<ActionResult<PagedResponse<ProductResponse>>> GetProducts(
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string sortBy = "name",
        [FromQuery] string sortDirection = "asc",
        [FromQuery] bool includeInactive = false,
        CancellationToken cancellationToken = default)
    {
        if (page < 1 || pageSize < 1 || pageSize > 100)
        {
            return BadRequest(new ProblemDetails
            {
                Title = "Invalid pagination values.",
                Detail = "Page must be at least 1 and pageSize must be between 1 and 100.",
                Status = StatusCodes.Status400BadRequest
            });
        }

        if (sortBy is not ("name" or "brand" or "purchasePrice" or "salePrice" or "stock"))
        {
            return BadRequest(new ProblemDetails
            {
                Title = "Invalid sort field.",
                Detail = "sortBy must be name, brand, purchasePrice, salePrice, or stock.",
                Status = StatusCodes.Status400BadRequest
            });
        }

        if (sortDirection is not ("asc" or "desc"))
        {
            return BadRequest(new ProblemDetails
            {
                Title = "Invalid sort direction.",
                Detail = "sortDirection must be asc or desc.",
                Status = StatusCodes.Status400BadRequest
            });
        }

        IQueryable<Product> query = _context.Products.AsNoTracking();

        if (!includeInactive)
        {
            query = query.Where(product => product.IsActive);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(product =>
                product.Name.Contains(term) ||
                (product.Brand != null && product.Brand.Contains(term)) ||
                (product.Model != null && product.Model.Contains(term)) ||
                (product.Sku != null && product.Sku.Contains(term)) ||
                (product.Barcode != null && product.Barcode.Contains(term)));
        }

        var descending = sortDirection == "desc";
        query = (sortBy, descending) switch
        {
            ("name", false) => query.OrderBy(product => product.Name).ThenBy(product => product.Id),
            ("name", true) => query.OrderByDescending(product => product.Name).ThenBy(product => product.Id),
            ("brand", false) => query.OrderBy(product => product.Brand).ThenBy(product => product.Name),
            ("brand", true) => query.OrderByDescending(product => product.Brand).ThenBy(product => product.Name),
            ("purchasePrice", false) => query.OrderBy(product => product.PurchasePrice).ThenBy(product => product.Id),
            ("purchasePrice", true) => query.OrderByDescending(product => product.PurchasePrice).ThenBy(product => product.Id),
            ("salePrice", false) => query.OrderBy(product => product.SalePrice).ThenBy(product => product.Id),
            ("salePrice", true) => query.OrderByDescending(product => product.SalePrice).ThenBy(product => product.Id),
            ("stock", false) => query.OrderBy(product => product.CurrentStock).ThenBy(product => product.Id),
            ("stock", true) => query.OrderByDescending(product => product.CurrentStock).ThenBy(product => product.Id),
            _ => query
        };

        var totalCount = await query.CountAsync(cancellationToken);
        var products = await query
            .Include(product => product.Category)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return Ok(new PagedResponse<ProductResponse>
        {
            Items = products.Select(ToResponse).ToArray(),
            Page = page,
            PageSize = pageSize,
            TotalCount = totalCount
        });
    }

    // GET /api/products/5
    [HttpGet("{id:int}")]
    public async Task<ActionResult<ProductResponse>> GetProduct(
        int id,
        CancellationToken cancellationToken)
    {
        var product = await _context.Products
            .AsNoTracking()
            .Include(item => item.Category)
            .FirstOrDefaultAsync(item => item.Id == id, cancellationToken);

        return product is null ? NotFound() : Ok(ToResponse(product));
    }

    // GET /api/products/barcode/0123456789012
    [HttpGet("barcode/{barcode}")]
    public async Task<ActionResult<ProductResponse>> GetProductByBarcode(
        string barcode,
        CancellationToken cancellationToken)
    {
        var normalizedBarcode = barcode.Trim();
        if (normalizedBarcode.Length == 0)
        {
            return BadRequest(new ProblemDetails
            {
                Title = "Barcode is required.",
                Status = StatusCodes.Status400BadRequest
            });
        }

        var product = await _context.Products
            .AsNoTracking()
            .Include(item => item.Category)
            .FirstOrDefaultAsync(item => item.Barcode == normalizedBarcode && item.IsActive, cancellationToken);

        return product is null ? NotFound() : Ok(ToResponse(product));
    }

    [Authorize(Roles = AppRoles.Admin)]
    [HttpPost("{id:int}/generate-barcode")]
    public async Task<ActionResult<ProductResponse>> GenerateBarcode(int id, CancellationToken cancellationToken)
    {
        var product = await _context.Products
            .Include(item => item.Category)
            .FirstOrDefaultAsync(item => item.Id == id, cancellationToken);
        if (product is null) return NotFound();
        if (!string.IsNullOrWhiteSpace(product.Barcode)) return Ok(ToResponse(product));

        for (var attempt = 0; attempt < 100; attempt++)
        {
            var candidate = _barcodeGenerator.CreateCandidate(product.Id, attempt);
            if (await BarcodeExists(candidate, cancellationToken)) continue;

            product.Barcode = candidate;
            product.UpdatedAtUtc = DateTime.UtcNow;
            try
            {
                await _context.SaveChangesAsync(cancellationToken);
                return Ok(ToResponse(product));
            }
            catch (DbUpdateConcurrencyException)
            {
                return ConcurrencyConflict();
            }
            catch (DbUpdateException exception) when (IsUniqueConstraintViolation(exception))
            {
                return BarcodeConflict();
            }
        }

        return Conflict(new ProblemDetails
        {
            Title = "Could not generate a unique barcode.",
            Detail = "Try again or enter a barcode manually.",
            Status = StatusCodes.Status409Conflict
        });
    }

    // POST /api/products
    [Authorize(Roles = AppRoles.Admin)]
    [HttpPost]
    public async Task<ActionResult<ProductResponse>> CreateProduct(
        ProductRequest request,
        CancellationToken cancellationToken)
    {
        var category = await _context.Categories
            .FirstOrDefaultAsync(item => item.Id == request.CategoryId && item.IsActive, cancellationToken);
        if (category is null)
        {
            return UnprocessableEntity(new ProblemDetails
            {
                Title = "Category is invalid.",
                Detail = "Choose an active category that exists in the database.",
                Status = StatusCodes.Status422UnprocessableEntity
            });
        }

        var barcode = NormalizeOptional(request.Barcode);
        var sku = NormalizeOptional(request.Sku);
        if (barcode is not null && await BarcodeExists(barcode, cancellationToken))
        {
            return BarcodeConflict();
        }
        if (sku is not null && await SkuExists(sku, cancellationToken))
        {
            return SkuConflict();
        }

        var product = new Product
        {
            Category = category,
            Name = request.Name.Trim(),
            Brand = NormalizeOptional(request.Brand),
            Model = NormalizeOptional(request.Model),
            Sku = sku,
            HSNCode = NormalizeOptional(request.HSNCode),
            Barcode = barcode,
            Unit = request.Unit.Trim(),
            PurchasePrice = request.PurchasePrice,
            SalePrice = request.SalePrice,
            CurrentStock = 0m,
            MinimumStock = request.MinimumStock,
            WarrantyMonths = request.WarrantyMonths,
            WarrantyType = NormalizeOptional(request.WarrantyType),
            IsActive = true,
            CreatedAtUtc = DateTime.UtcNow
        };

        _context.Products.Add(product);
        try
        {
            await _context.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (IsUniqueConstraintViolation(exception))
        {
            return ProductIdentifierConflict();
        }

        return CreatedAtAction(nameof(GetProduct), new { id = product.Id }, ToResponse(product));
    }

    // PUT /api/products/5
    [Authorize(Roles = AppRoles.Admin)]
    [HttpPut("{id:int}")]
    public async Task<ActionResult<ProductResponse>> UpdateProduct(
        int id,
        ProductRequest request,
        CancellationToken cancellationToken)
    {
        var product = await _context.Products
            .Include(item => item.Category)
            .FirstOrDefaultAsync(item => item.Id == id && item.IsActive, cancellationToken);

        if (product is null)
        {
            return NotFound();
        }

        if (string.IsNullOrWhiteSpace(request.RowVersion))
        {
            return BadRequest(new ProblemDetails
            {
                Title = "RowVersion is required.",
                Detail = "Send the RowVersion returned by the latest product read to prevent overwriting another user's changes.",
                Status = StatusCodes.Status400BadRequest
            });
        }

        byte[] submittedRowVersion;
        try
        {
            submittedRowVersion = Convert.FromBase64String(request.RowVersion);
        }
        catch (FormatException)
        {
            return BadRequest(new ProblemDetails
            {
                Title = "RowVersion is invalid.",
                Detail = "RowVersion must be a base64 SQL Server rowversion value.",
                Status = StatusCodes.Status400BadRequest
            });
        }

        if (submittedRowVersion.Length != 8)
        {
            return BadRequest(new ProblemDetails
            {
                Title = "RowVersion is invalid.",
                Detail = "RowVersion must be a base64 SQL Server rowversion value.",
                Status = StatusCodes.Status400BadRequest
            });
        }

        var category = await _context.Categories
            .FirstOrDefaultAsync(item => item.Id == request.CategoryId && item.IsActive, cancellationToken);
        if (category is null)
        {
            return UnprocessableEntity(new ProblemDetails
            {
                Title = "Category is invalid.",
                Detail = "Choose an active category that exists in the database.",
                Status = StatusCodes.Status422UnprocessableEntity
            });
        }

        var barcode = NormalizeOptional(request.Barcode);
        var sku = NormalizeOptional(request.Sku) ?? product.Sku;
        if (barcode is not null && await BarcodeExists(barcode, cancellationToken, id))
        {
            return BarcodeConflict();
        }
        if (sku is not null && await SkuExists(sku, cancellationToken, id))
        {
            return SkuConflict();
        }

        _context.Entry(product).Property(item => item.RowVersion).OriginalValue = submittedRowVersion;
        product.Category = category;
        product.CategoryId = category.Id;
        product.Name = request.Name.Trim();
        product.Brand = NormalizeOptional(request.Brand);
        product.Model = NormalizeOptional(request.Model);
        product.Sku = sku;
        product.HSNCode = NormalizeOptional(request.HSNCode);
        product.Barcode = barcode;
        product.Unit = request.Unit.Trim();
        product.PurchasePrice = request.PurchasePrice;
        product.SalePrice = request.SalePrice;
        product.MinimumStock = request.MinimumStock;
        product.WarrantyMonths = request.WarrantyMonths;
        product.WarrantyType = NormalizeOptional(request.WarrantyType);
        product.UpdatedAtUtc = DateTime.UtcNow;

        try
        {
            await _context.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            return ConcurrencyConflict();
        }
        catch (DbUpdateException exception) when (IsUniqueConstraintViolation(exception))
        {
            return ProductIdentifierConflict();
        }

        return Ok(ToResponse(product));
    }

    // POST /api/products/5/activate
    [Authorize(Roles = AppRoles.Admin)]
    [HttpPost("{id:int}/activate")]
    public Task<ActionResult<ProductResponse>> ActivateProduct(
        int id,
        CancellationToken cancellationToken) => SetActive(id, true, cancellationToken);

    // POST /api/products/5/deactivate
    [Authorize(Roles = AppRoles.Admin)]
    [HttpPost("{id:int}/deactivate")]
    public Task<ActionResult<ProductResponse>> DeactivateProduct(
        int id,
        CancellationToken cancellationToken) => SetActive(id, false, cancellationToken);

    private async Task<ActionResult<ProductResponse>> SetActive(
        int id,
        bool isActive,
        CancellationToken cancellationToken)
    {
        var product = await _context.Products
            .Include(item => item.Category)
            .FirstOrDefaultAsync(item => item.Id == id, cancellationToken);

        if (product is null)
        {
            return NotFound();
        }

        if (product.IsActive == isActive)
        {
            return Ok(ToResponse(product));
        }

        product.IsActive = isActive;
        product.UpdatedAtUtc = DateTime.UtcNow;

        try
        {
            await _context.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            return ConcurrencyConflict();
        }

        return Ok(ToResponse(product));
    }

    private Task<bool> BarcodeExists(
        string barcode,
        CancellationToken cancellationToken,
        int? exceptProductId = null)
    {
        var query = _context.Products.Where(item => item.Barcode == barcode);
        if (exceptProductId.HasValue)
        {
            query = query.Where(item => item.Id != exceptProductId.Value);
        }

        return query.AnyAsync(cancellationToken);
    }

    private Task<bool> SkuExists(
        string sku,
        CancellationToken cancellationToken,
        int? exceptProductId = null)
    {
        var query = _context.Products.Where(item => item.Sku == sku);
        if (exceptProductId.HasValue)
        {
            query = query.Where(item => item.Id != exceptProductId.Value);
        }

        return query.AnyAsync(cancellationToken);
    }

    private static string? NormalizeOptional(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Trim();
    }

    private static bool IsUniqueConstraintViolation(DbUpdateException exception) =>
        exception.InnerException is SqlException { Number: 2601 or 2627 };

    private static ObjectResult BarcodeConflict() => new(new ProblemDetails
    {
        Title = "Barcode already exists.",
        Detail = "Each non-empty barcode must belong to only one product, including inactive products.",
        Status = StatusCodes.Status409Conflict
    })
    {
        StatusCode = StatusCodes.Status409Conflict
    };

    private static ObjectResult SkuConflict() => new(new ProblemDetails
    {
        Title = "SKU already exists.",
        Detail = "Each non-empty SKU must belong to only one product, including inactive products.",
        Status = StatusCodes.Status409Conflict
    })
    {
        StatusCode = StatusCodes.Status409Conflict
    };

    private static ObjectResult ProductIdentifierConflict() => new(new ProblemDetails
    {
        Title = "SKU or barcode already exists.",
        Detail = "Choose a SKU and barcode that are not assigned to another product.",
        Status = StatusCodes.Status409Conflict
    })
    {
        StatusCode = StatusCodes.Status409Conflict
    };

    private static ObjectResult ConcurrencyConflict() => new(new ProblemDetails
    {
        Title = "Product was changed by another user.",
        Detail = "Reload the product and apply your changes again using its latest RowVersion.",
        Status = StatusCodes.Status409Conflict
    })
    {
        StatusCode = StatusCodes.Status409Conflict
    };

    private static ProductResponse ToResponse(Product product) => new()
    {
        Id = product.Id,
        CategoryId = product.CategoryId,
        CategoryName = product.Category.Name,
        Name = product.Name,
        Brand = product.Brand,
        Model = product.Model,
        Sku = product.Sku,
        HSNCode = product.HSNCode,
        Barcode = product.Barcode,
        Unit = product.Unit,
        PurchasePrice = product.PurchasePrice,
        SalePrice = product.SalePrice,
        CurrentStock = product.CurrentStock,
        MinimumStock = product.MinimumStock,
        WarrantyMonths = product.WarrantyMonths,
        WarrantyType = product.WarrantyType,
        IsActive = product.IsActive,
        CreatedAtUtc = product.CreatedAtUtc,
        CreatedBy = product.CreatedBy,
        UpdatedAtUtc = product.UpdatedAtUtc,
        UpdatedBy = product.UpdatedBy,
        RowVersion = Convert.ToBase64String(product.RowVersion)
    };
}
