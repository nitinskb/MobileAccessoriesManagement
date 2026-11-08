namespace MobileAccessories.Api.Models
{
    public class Product
    {
        public int Id { get; set; }

        public int CategoryId { get; set; }

        public Category Category { get; set; } = null!;

        public string Name { get; set; } = string.Empty;

        public string? Brand { get; set; }

        public string? Model { get; set; }

        public string? Sku { get; set; }

        public string? HSNCode { get; set; }

        public string? Barcode { get; set; }

        public string Unit { get; set; } = "pcs";

        public decimal PurchasePrice { get; set; }

        public decimal SalePrice { get; set; }

        public decimal CurrentStock { get; set; }

        public decimal MinimumStock { get; set; }

        public int WarrantyMonths { get; set; }

        public string? WarrantyType { get; set; }

        public bool IsActive { get; set; } = true;

        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

        public string? CreatedBy { get; set; }

        public DateTime? UpdatedAtUtc { get; set; }

        public string? UpdatedBy { get; set; }

        public byte[] RowVersion { get; set; } = Array.Empty<byte>();
    }
}
