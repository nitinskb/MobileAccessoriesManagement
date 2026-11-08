namespace MobileAccessories.Api.DTOs;

public sealed class ProductResponse
{
    public int Id { get; init; }

    public int CategoryId { get; init; }

    public string CategoryName { get; init; } = string.Empty;

    public string Name { get; init; } = string.Empty;

    public string? Brand { get; init; }

    public string? Model { get; init; }

    public string? Sku { get; init; }

    public string? HSNCode { get; init; }

    public string? Barcode { get; init; }

    public string Unit { get; init; } = string.Empty;

    public decimal PurchasePrice { get; init; }

    public decimal SalePrice { get; init; }

    public decimal CurrentStock { get; init; }

    public decimal MinimumStock { get; init; }

    public int WarrantyMonths { get; init; }

    public string? WarrantyType { get; init; }

    public bool IsActive { get; init; }

    public DateTime CreatedAtUtc { get; init; }

    public string? CreatedBy { get; init; }

    public DateTime? UpdatedAtUtc { get; init; }

    public string? UpdatedBy { get; init; }

    public string RowVersion { get; init; } = string.Empty;
}
