using System.ComponentModel.DataAnnotations;

namespace MobileAccessories.Api.DTOs
{
    public sealed class ProductRequest : IValidatableObject
    {
        [Range(1, int.MaxValue, ErrorMessage = "Select a valid category.")]
        public int CategoryId { get; set; }

        [Required]
        [StringLength(150)]
        public string Name { get; set; } = string.Empty;

        [StringLength(100)]
        public string? Brand { get; set; }

        [StringLength(100)]
        public string? Model { get; set; }

        [StringLength(50)]
        public string? Sku { get; set; }

        [StringLength(20)]
        public string? HSNCode { get; set; }

        [StringLength(100)]
        public string? Barcode { get; set; }

        [Required]
        [StringLength(20)]
        public string Unit { get; set; } = "pcs";

        [Range(typeof(decimal), "0", "9999999999999999.99")]
        public decimal PurchasePrice { get; set; }

        [Range(typeof(decimal), "0", "9999999999999999.99")]
        public decimal SalePrice { get; set; }

        [Range(typeof(decimal), "0", "999999999999999.999")]
        public decimal MinimumStock { get; set; }

        [Range(0, 1200)]
        public int WarrantyMonths { get; set; }

        [StringLength(50)]
        public string? WarrantyType { get; set; }

        public string? RowVersion { get; set; }

        public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
        {
            if (decimal.Round(PurchasePrice, 2) != PurchasePrice)
            {
                yield return new ValidationResult(
                    "Purchase price can have at most 2 decimal places.",
                    new[] { nameof(PurchasePrice) });
            }

            if (decimal.Round(SalePrice, 2) != SalePrice)
            {
                yield return new ValidationResult(
                    "Sale price can have at most 2 decimal places.",
                    new[] { nameof(SalePrice) });
            }

            if (decimal.Round(MinimumStock, 3) != MinimumStock)
            {
                yield return new ValidationResult(
                    "Minimum stock can have at most 3 decimal places.",
                    new[] { nameof(MinimumStock) });
            }

            if (!string.IsNullOrEmpty(Barcode) && Barcode != Barcode.Trim())
            {
                yield return new ValidationResult(
                    "Barcode must not start or end with whitespace.",
                    new[] { nameof(Barcode) });
            }

            if (!string.IsNullOrEmpty(Sku) && Sku != Sku.Trim())
            {
                yield return new ValidationResult(
                    "SKU must not start or end with whitespace.",
                    new[] { nameof(Sku) });
            }

            if (!string.IsNullOrWhiteSpace(RowVersion))
            {
                byte[]? rowVersionBytes = null;
                try
                {
                    rowVersionBytes = Convert.FromBase64String(RowVersion);
                }
                catch (FormatException)
                {
                    // The length check below returns the validation message.
                }

                if (rowVersionBytes is null || rowVersionBytes.Length != 8)
                {
                    yield return new ValidationResult(
                        "RowVersion must be a valid base64 SQL Server rowversion value.",
                        new[] { nameof(RowVersion) });
                }
            }
        }

    }
}
