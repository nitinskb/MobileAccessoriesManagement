namespace MobileAccessories.Api.Models;

public sealed class StockMovement
{
    public long Id { get; set; }
    public int ProductId { get; set; }
    public Product Product { get; set; } = null!;
    public int? InvoiceId { get; set; }
    public Invoice? Invoice { get; set; }
    public decimal QuantityChange { get; set; }
    public decimal StockAfter { get; set; }
    public string Reason { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public string CreatedByEmail { get; set; } = string.Empty;
}
