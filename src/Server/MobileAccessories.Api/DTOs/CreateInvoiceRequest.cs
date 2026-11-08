using System.ComponentModel.DataAnnotations;

namespace MobileAccessories.Api.DTOs;

public sealed class CreateInvoiceRequest
{
    [StringLength(150)] public string? CustomerName { get; set; }
    [StringLength(20)] public string? CustomerPhone { get; set; }
    [StringLength(500)] public string? Notes { get; set; }
    [Required, MinLength(1), MaxLength(100)] public List<CreateInvoiceLineRequest> Lines { get; set; } = [];
}

public sealed class CreateInvoiceLineRequest
{
    [Range(1, int.MaxValue)] public int ProductId { get; set; }
    [Range(typeof(decimal), "0.001", "9999999999999999")] public decimal Quantity { get; set; }
}
