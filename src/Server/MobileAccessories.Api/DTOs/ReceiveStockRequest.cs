using System.ComponentModel.DataAnnotations;

namespace MobileAccessories.Api.DTOs;

public sealed class ReceiveStockRequest
{
    [Range(typeof(decimal), "0.001", "999999999999999")]
    public decimal Quantity { get; set; }

    [Required, StringLength(250)]
    public string Reason { get; set; } = string.Empty;
}
