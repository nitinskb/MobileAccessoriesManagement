namespace MobileAccessories.Api.Models;

public sealed class Invoice
{
    public int Id { get; set; }
    public string InvoiceNumber { get; set; } = string.Empty;
    public string? CustomerName { get; set; }
    public string? CustomerPhone { get; set; }
    public string? Notes { get; set; }
    public decimal Total { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public string CreatedByUserId { get; set; } = string.Empty;
    public string CreatedByEmail { get; set; } = string.Empty;
    public ICollection<InvoiceLine> Lines { get; set; } = new List<InvoiceLine>();
}
