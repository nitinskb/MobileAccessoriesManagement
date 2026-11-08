using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using MobileAccessories.Api.Data;
using MobileAccessories.Api.DTOs;
using MobileAccessories.Api.Models;
using MobileAccessories.Api.Security;

namespace MobileAccessories.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/[controller]")]
public sealed class CategoriesController : ControllerBase
{
    private readonly AppDbContext _context;

    public CategoriesController(AppDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<ActionResult<PagedResponse<CategoryResponse>>> GetCategories(
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
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

        if (sortDirection is not ("asc" or "desc"))
        {
            return BadRequest(new ProblemDetails
            {
                Title = "Invalid sort direction.",
                Detail = "sortDirection must be asc or desc.",
                Status = StatusCodes.Status400BadRequest
            });
        }

        IQueryable<Category> query = _context.Categories.AsNoTracking();
        if (!includeInactive)
        {
            query = query.Where(category => category.IsActive);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(category => category.Name.Contains(term) ||
                (category.Description != null && category.Description.Contains(term)));
        }

        query = sortDirection == "desc"
            ? query.OrderByDescending(category => category.Name).ThenBy(category => category.Id)
            : query.OrderBy(category => category.Name).ThenBy(category => category.Id);

        var totalCount = await query.CountAsync(cancellationToken);
        var rows = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(category => new CategorySnapshot
            {
                Id = category.Id,
                Name = category.Name,
                Description = category.Description,
                IsActive = category.IsActive,
                ProductCount = category.Products.Count,
                CreatedAtUtc = category.CreatedAtUtc,
                UpdatedAtUtc = category.UpdatedAtUtc,
                RowVersion = category.RowVersion
            })
            .ToListAsync(cancellationToken);
        var responses = rows.Select(category => new CategoryResponse
        {
            Id = category.Id,
            Name = category.Name,
            Description = category.Description,
            IsActive = category.IsActive,
            ProductCount = category.ProductCount,
            CreatedAtUtc = category.CreatedAtUtc,
            UpdatedAtUtc = category.UpdatedAtUtc,
            RowVersion = Convert.ToBase64String(category.RowVersion)
        }).ToList();

        return Ok(new PagedResponse<CategoryResponse>
        {
            Items = responses,
            Page = page,
            PageSize = pageSize,
            TotalCount = totalCount
        });
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<CategoryResponse>> GetCategory(
        int id,
        CancellationToken cancellationToken)
    {
        var category = await _context.Categories
            .AsNoTracking()
            .Where(item => item.Id == id)
            .Select(item => new CategorySnapshot
            {
                Id = item.Id,
                Name = item.Name,
                Description = item.Description,
                IsActive = item.IsActive,
                ProductCount = item.Products.Count,
                CreatedAtUtc = item.CreatedAtUtc,
                UpdatedAtUtc = item.UpdatedAtUtc,
                RowVersion = item.RowVersion
            })
            .FirstOrDefaultAsync(cancellationToken);

        return category is null ? NotFound() : Ok(new CategoryResponse
        {
            Id = category.Id,
            Name = category.Name,
            Description = category.Description,
            IsActive = category.IsActive,
            ProductCount = category.ProductCount,
            CreatedAtUtc = category.CreatedAtUtc,
            UpdatedAtUtc = category.UpdatedAtUtc,
            RowVersion = Convert.ToBase64String(category.RowVersion)
        });
    }

    [Authorize(Roles = AppRoles.Admin)]
    [HttpPost]
    public async Task<ActionResult<CategoryResponse>> CreateCategory(
        CategoryRequest request,
        CancellationToken cancellationToken)
    {
        var normalizedName = request.Name.Trim();
        if (await _context.Categories.AnyAsync(item => item.Name == normalizedName, cancellationToken))
        {
            return CategoryNameConflict();
        }

        var category = new Category
        {
            Name = normalizedName,
            Description = NormalizeOptional(request.Description),
            IsActive = true,
            CreatedAtUtc = DateTime.UtcNow
        };

        _context.Categories.Add(category);
        try
        {
            await _context.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (IsUniqueConstraintViolation(exception))
        {
            return CategoryNameConflict();
        }

        return CreatedAtAction(nameof(GetCategory), new { id = category.Id }, ToResponse(category, 0));
    }

    [Authorize(Roles = AppRoles.Admin)]
    [HttpPut("{id:int}")]
    public async Task<ActionResult<CategoryResponse>> UpdateCategory(
        int id,
        CategoryRequest request,
        CancellationToken cancellationToken)
    {
        var category = await _context.Categories
            .FirstOrDefaultAsync(item => item.Id == id, cancellationToken);
        if (category is null)
        {
            return NotFound();
        }

        if (string.IsNullOrWhiteSpace(request.RowVersion))
        {
            return BadRequest(new ProblemDetails
            {
                Title = "RowVersion is required.",
                Detail = "Read the category first and send its current RowVersion when updating.",
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
            return InvalidRowVersion();
        }

        if (submittedRowVersion.Length != 8)
        {
            return InvalidRowVersion();
        }

        var normalizedName = request.Name.Trim();
        if (await _context.Categories.AnyAsync(
                item => item.Name == normalizedName && item.Id != id,
                cancellationToken))
        {
            return CategoryNameConflict();
        }

        _context.Entry(category).Property(item => item.RowVersion).OriginalValue = submittedRowVersion;
        category.Name = normalizedName;
        category.Description = NormalizeOptional(request.Description);
        category.UpdatedAtUtc = DateTime.UtcNow;

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
            return CategoryNameConflict();
        }

        var productCount = await _context.Products.CountAsync(item => item.CategoryId == id, cancellationToken);
        return Ok(ToResponse(category, productCount));
    }

    [Authorize(Roles = AppRoles.Admin)]
    [HttpPost("{id:int}/activate")]
    public Task<ActionResult<CategoryResponse>> ActivateCategory(
        int id,
        CancellationToken cancellationToken) => SetActive(id, true, cancellationToken);

    [Authorize(Roles = AppRoles.Admin)]
    [HttpPost("{id:int}/deactivate")]
    public Task<ActionResult<CategoryResponse>> DeactivateCategory(
        int id,
        CancellationToken cancellationToken) => SetActive(id, false, cancellationToken);

    private async Task<ActionResult<CategoryResponse>> SetActive(
        int id,
        bool isActive,
        CancellationToken cancellationToken)
    {
        var category = await _context.Categories
            .FirstOrDefaultAsync(item => item.Id == id, cancellationToken);
        if (category is null)
        {
            return NotFound();
        }

        if (!isActive && category.IsActive)
        {
            var activeProductCount = await _context.Products.CountAsync(
                product => product.CategoryId == id && product.IsActive,
                cancellationToken);
            if (activeProductCount > 0)
            {
                return Conflict(new ProblemDetails
                {
                    Title = "Category is in use.",
                    Detail = "Move or deactivate the active products in this category before deactivating it.",
                    Status = StatusCodes.Status409Conflict
                });
            }
        }

        if (category.IsActive != isActive)
        {
            category.IsActive = isActive;
            category.UpdatedAtUtc = DateTime.UtcNow;
            try
            {
                await _context.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateConcurrencyException)
            {
                return ConcurrencyConflict();
            }
        }

        var productCount = await _context.Products.CountAsync(item => item.CategoryId == id, cancellationToken);
        return Ok(ToResponse(category, productCount));
    }

    private static CategoryResponse ToResponse(Category category, int productCount) => new()
    {
        Id = category.Id,
        Name = category.Name,
        Description = category.Description,
        IsActive = category.IsActive,
        ProductCount = productCount,
        CreatedAtUtc = category.CreatedAtUtc,
        UpdatedAtUtc = category.UpdatedAtUtc,
        RowVersion = Convert.ToBase64String(category.RowVersion)
    };

    private sealed class CategorySnapshot
    {
        public int Id { get; init; }
        public string Name { get; init; } = string.Empty;
        public string? Description { get; init; }
        public bool IsActive { get; init; }
        public int ProductCount { get; init; }
        public DateTime CreatedAtUtc { get; init; }
        public DateTime? UpdatedAtUtc { get; init; }
        public byte[] RowVersion { get; init; } = Array.Empty<byte>();
    }

    private static string? NormalizeOptional(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static bool IsUniqueConstraintViolation(DbUpdateException exception) =>
        exception.InnerException is SqlException { Number: 2601 or 2627 };

    private static ObjectResult CategoryNameConflict() => new(new ProblemDetails
    {
        Title = "Category name already exists.",
        Detail = "Choose a name that is not already used by another category.",
        Status = StatusCodes.Status409Conflict
    })
    {
        StatusCode = StatusCodes.Status409Conflict
    };

    private static ObjectResult InvalidRowVersion() => new(new ProblemDetails
    {
        Title = "RowVersion is invalid.",
        Detail = "RowVersion must be a valid base64 SQL Server rowversion value.",
        Status = StatusCodes.Status400BadRequest
    })
    {
        StatusCode = StatusCodes.Status400BadRequest
    };

    private static ObjectResult ConcurrencyConflict() => new(new ProblemDetails
    {
        Title = "Category was changed by another user.",
        Detail = "Reload the category and apply your changes using its latest RowVersion.",
        Status = StatusCodes.Status409Conflict
    })
    {
        StatusCode = StatusCodes.Status409Conflict
    };
}
