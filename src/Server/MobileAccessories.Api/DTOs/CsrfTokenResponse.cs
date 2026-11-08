namespace MobileAccessories.Api.DTOs;

public sealed class CsrfTokenResponse
{
    public string RequestToken { get; init; } = string.Empty;
}
