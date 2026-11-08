namespace MobileAccessories.Api.DTOs;

public sealed class CategoryResponse
{
    public int Id { get; init; }

    public string Name { get; init; } = string.Empty;

    public string? Description { get; init; }

    public bool IsActive { get; init; }

    public int ProductCount { get; init; }

    public DateTime CreatedAtUtc { get; init; }

    public DateTime? UpdatedAtUtc { get; init; }

    public string RowVersion { get; init; } = string.Empty;
}
