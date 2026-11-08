using System.ComponentModel.DataAnnotations;

namespace MobileAccessories.Api.DTOs;

public sealed class CreateUserRequest
{
    [Required]
    [EmailAddress]
    [StringLength(256)]
    public string Email { get; set; } = string.Empty;

    [Required]
    [StringLength(128, MinimumLength = 12)]
    public string TemporaryPassword { get; set; } = string.Empty;
}
