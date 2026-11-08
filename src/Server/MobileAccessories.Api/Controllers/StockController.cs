using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MobileAccessories.Api.Data;
using MobileAccessories.Api.DTOs;
using MobileAccessories.Api.Models;
using MobileAccessories.Api.Security;

namespace MobileAccessories.Api.Controllers;

[ApiController]
[Authorize(Roles = AppRoles.Admin)]
[Route("api/stock")]
public sealed class StockController : ControllerBase
{
    private readonly AppDbContext _context;
    public StockController(AppDbContext context) => _context = context;

    [HttpPost("products/{productId:int}/receipts")]
    public async Task<IActionResult> ReceiveStock(int productId, ReceiveStockRequest request, CancellationToken cancellationToken)
    {
        if (decimal.Round(request.Quantity, 3) != request.Quantity)
            return BadRequest(new ProblemDetails { Title = "Quantity supports at most three decimal places.", Status = 400 });

        var product = await _context.Products.FirstOrDefaultAsync(item => item.Id == productId && item.IsActive, cancellationToken);
        if (product is null) return NotFound(new ProblemDetails { Title = "Active product not found.", Status = 404 });

        var nextStock = product.CurrentStock + request.Quantity;
        if (nextStock > 999999999999999m)
            return UnprocessableEntity(new ProblemDetails { Title = "Stock exceeds the supported limit.", Status = 422 });

        product.CurrentStock = nextStock;
        product.UpdatedAtUtc = DateTime.UtcNow;
        _context.StockMovements.Add(new StockMovement
        {
            Product = product,
            QuantityChange = request.Quantity,
            StockAfter = nextStock,
            Reason = request.Reason.Trim(),
            CreatedAtUtc = DateTime.UtcNow,
            CreatedByEmail = User.FindFirstValue(ClaimTypes.Email) ?? User.Identity?.Name ?? "Unknown user"
        });

        try { await _context.SaveChangesAsync(cancellationToken); }
        catch (DbUpdateConcurrencyException)
        {
            return Conflict(new ProblemDetails { Title = "Product stock changed concurrently.", Detail = "Reload the product and try again.", Status = 409 });
        }

        return Ok(new { product.Id, product.Name, product.CurrentStock, product.Unit });
    }
}
