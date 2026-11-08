namespace MobileAccessories.Api.DTOs;

public sealed class UserSummaryResponse
{
    public string Id { get; init; } = string.Empty;

    public string Email { get; init; } = string.Empty;

    public IReadOnlyList<string> Roles { get; init; } = Array.Empty<string>();
}
