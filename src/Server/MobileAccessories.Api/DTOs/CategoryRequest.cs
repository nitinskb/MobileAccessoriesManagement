using System.ComponentModel.DataAnnotations;

namespace MobileAccessories.Api.DTOs;

public sealed class CategoryRequest
{
    [Required]
    [StringLength(100)]
    public string Name { get; set; } = string.Empty;

    [StringLength(500)]
    public string? Description { get; set; }

    public string? RowVersion { get; set; }
}
