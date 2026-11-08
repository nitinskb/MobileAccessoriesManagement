using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MobileAccessories.Api.Data;
using MobileAccessories.Api.DTOs;
using MobileAccessories.Api.Models;

namespace MobileAccessories.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/[controller]")]
public sealed class InvoicesController : ControllerBase
{
    private readonly AppDbContext _context;

    public InvoicesController(AppDbContext context) => _context = context;

    [HttpGet]
    public async Task<ActionResult<PagedResponse<InvoiceListItemResponse>>> GetInvoices(
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        if (page < 1 || pageSize is < 1 or > 100)
            return BadRequest(new ProblemDetails { Title = "Page must be positive and pageSize must be between 1 and 100.", Status = 400 });

        var query = _context.Invoices.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            if (int.TryParse(term, out var invoiceId))
                query = query.Where(invoice => invoice.Id == invoiceId || invoice.InvoiceNumber.Contains(term) ||
                    (invoice.CustomerName != null && invoice.CustomerName.Contains(term)) || invoice.CreatedByEmail.Contains(term));
            else
                query = query.Where(invoice => invoice.InvoiceNumber.Contains(term) ||
                    (invoice.CustomerName != null && invoice.CustomerName.Contains(term)) ||
                    invoice.CreatedByEmail.Contains(term));
        }

        var totalCount = await query.CountAsync(cancellationToken);
        var items = await query.OrderByDescending(invoice => invoice.CreatedAtUtc).ThenByDescending(invoice => invoice.Id)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(invoice => new
            {
                Id = invoice.Id,
                CustomerName = invoice.CustomerName,
                Total = invoice.Total,
                CreatedAtUtc = invoice.CreatedAtUtc,
                CreatedByEmail = invoice.CreatedByEmail
            }).ToListAsync(cancellationToken);

        return Ok(new PagedResponse<InvoiceListItemResponse> { Items = items.Select(invoice => new InvoiceListItemResponse
        {
            Id = invoice.Id,
            InvoiceNumber = invoice.Id.ToString(System.Globalization.CultureInfo.InvariantCulture),
            CustomerName = invoice.CustomerName,
            Total = invoice.Total,
            CreatedAtUtc = invoice.CreatedAtUtc,
            CreatedByEmail = invoice.CreatedByEmail
        }).ToArray(), Page = page, PageSize = pageSize, TotalCount = totalCount });
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<InvoiceResponse>> GetInvoice(int id, CancellationToken cancellationToken)
    {
        var invoice = await _context.Invoices.AsNoTracking().Include(item => item.Lines)
            .FirstOrDefaultAsync(item => item.Id == id, cancellationToken);
        return invoice is null ? NotFound() : Ok(ToResponse(invoice));
    }

    [HttpPost]
    public async Task<ActionResult<InvoiceResponse>> CreateInvoice(
        CreateInvoiceRequest request,
        CancellationToken cancellationToken)
    {
        if (request.Lines.Select(line => line.ProductId).Distinct().Count() != request.Lines.Count)
            return BadRequest(new ProblemDetails { Title = "Each product can appear only once per invoice.", Status = 400 });
        if (request.Lines.Any(line => decimal.Round(line.Quantity, 3) != line.Quantity))
            return BadRequest(new ProblemDetails { Title = "Quantity supports at most three decimal places.", Status = 400 });

        var requestedProductIds = request.Lines.Select(line => line.ProductId).ToArray();
        var products = await _context.Products
            .Where(product => requestedProductIds.Contains(product.Id) && product.IsActive)
            .ToDictionaryAsync(product => product.Id, cancellationToken);
        if (products.Count != request.Lines.Count)
            return UnprocessableEntity(new ProblemDetails { Title = "One or more products are unavailable.", Detail = "Refresh the product list and choose active products.", Status = 422 });

        foreach (var line in request.Lines)
        {
            if (products[line.ProductId].CurrentStock < line.Quantity)
                return Conflict(new ProblemDetails { Title = "Insufficient stock.", Detail = $"Not enough stock for {products[line.ProductId].Name}.", Status = 409 });
        }

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();
        var email = User.FindFirstValue(ClaimTypes.Email) ?? User.Identity?.Name ?? "Unknown user";
        var now = DateTime.UtcNow;
        var invoice = new Invoice
        {
            InvoiceNumber = $"TMP-{Guid.NewGuid():N}"[..32],
            CustomerName = Normalize(request.CustomerName),
            CustomerPhone = Normalize(request.CustomerPhone),
            Notes = Normalize(request.Notes),
            CreatedAtUtc = now,
            CreatedByUserId = userId,
            CreatedByEmail = email,
            Lines = request.Lines.Select(line =>
            {
                var product = products[line.ProductId];
                var lineTotal = decimal.Round(line.Quantity * product.SalePrice, 2, MidpointRounding.AwayFromZero);
                product.CurrentStock -= line.Quantity;
                product.UpdatedAtUtc = now;
                return new InvoiceLine
                {
                    ProductId = product.Id,
                    Product = product,
                    ProductName = product.Name,
                    Barcode = product.Barcode,
                    Unit = product.Unit,
                    Quantity = line.Quantity,
                    UnitPrice = product.SalePrice,
                    LineTotal = lineTotal
                };
            }).ToList()
        };
        invoice.Total = invoice.Lines.Sum(line => line.LineTotal);
        foreach (var line in invoice.Lines)
        {
            var product = products[line.ProductId];
            _context.StockMovements.Add(new StockMovement
            {
                Product = product,
                Invoice = invoice,
                QuantityChange = -line.Quantity,
                StockAfter = product.CurrentStock,
                Reason = "Invoice sale",
                CreatedAtUtc = now,
                CreatedByEmail = email
            });
        }

        await using var transaction = await _context.Database.BeginTransactionAsync(cancellationToken);
        _context.Invoices.Add(invoice);
        try
        {
            await _context.SaveChangesAsync(cancellationToken);
            invoice.InvoiceNumber = invoice.Id.ToString(System.Globalization.CultureInfo.InvariantCulture);
            await _context.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            await transaction.RollbackAsync(cancellationToken);
            return Conflict(new ProblemDetails { Title = "Stock changed while creating the invoice.", Detail = "Reload the product list and try again.", Status = 409 });
        }

        return CreatedAtAction(nameof(GetInvoice), new { id = invoice.Id }, ToResponse(invoice));
    }

    private static string? Normalize(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static InvoiceResponse ToResponse(Invoice invoice) => new()
    {
        Id = invoice.Id,
        InvoiceNumber = invoice.Id.ToString(System.Globalization.CultureInfo.InvariantCulture),
        CustomerName = invoice.CustomerName,
        CustomerPhone = invoice.CustomerPhone,
        Notes = invoice.Notes,
        Total = invoice.Total,
        CreatedAtUtc = invoice.CreatedAtUtc,
        CreatedByEmail = invoice.CreatedByEmail,
        Lines = invoice.Lines.OrderBy(line => line.Id).Select(line => new InvoiceLineResponse
        {
            ProductId = line.ProductId,
            ProductName = line.ProductName,
            Barcode = line.Barcode,
            Unit = line.Unit,
            Quantity = line.Quantity,
            UnitPrice = line.UnitPrice,
            LineTotal = line.LineTotal
        }).ToArray()
    };
}
