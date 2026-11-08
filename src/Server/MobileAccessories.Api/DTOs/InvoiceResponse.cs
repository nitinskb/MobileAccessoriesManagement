namespace MobileAccessories.Api.DTOs;

public sealed class InvoiceResponse
{
    public int Id { get; init; }
    public string InvoiceNumber { get; init; } = string.Empty;
    public string? CustomerName { get; init; }
    public string? CustomerPhone { get; init; }
    public string? Notes { get; init; }
    public decimal Total { get; init; }
    public DateTime CreatedAtUtc { get; init; }
    public string CreatedByEmail { get; init; } = string.Empty;
    public IReadOnlyList<InvoiceLineResponse> Lines { get; init; } = [];
}

public sealed class InvoiceLineResponse
{
    public int ProductId { get; init; }
    public string ProductName { get; init; } = string.Empty;
    public string? Barcode { get; init; }
    public string Unit { get; init; } = string.Empty;
    public decimal Quantity { get; init; }
    public decimal UnitPrice { get; init; }
    public decimal LineTotal { get; init; }
}

public sealed class InvoiceListItemResponse
{
    public int Id { get; init; }
    public string InvoiceNumber { get; init; } = string.Empty;
    public string? CustomerName { get; init; }
    public decimal Total { get; init; }
    public DateTime CreatedAtUtc { get; init; }
    public string CreatedByEmail { get; init; } = string.Empty;
}
