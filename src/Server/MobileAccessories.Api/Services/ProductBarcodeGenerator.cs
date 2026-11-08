using System.Globalization;

namespace MobileAccessories.Api.Services;

public sealed class ProductBarcodeGenerator
{
    public string CreateCandidate(int productId, int attempt)
    {
        var productCode = productId.ToString("D10", CultureInfo.InvariantCulture);
        return attempt == 0
            ? $"MA{productCode}"
            : $"MA{productCode}{attempt.ToString("D2", CultureInfo.InvariantCulture)}";
    }
}
