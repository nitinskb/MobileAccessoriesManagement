namespace MobileAccessories.Api.Data;

public sealed class IdentitySeederHostedService : IHostedService
{
    private readonly IServiceProvider _services;
    private readonly IConfiguration _configuration;

    public IdentitySeederHostedService(IServiceProvider services, IConfiguration configuration)
    {
        _services = services;
        _configuration = configuration;
    }

    public Task StartAsync(CancellationToken cancellationToken) =>
        IdentitySeeder.SeedAsync(_services, _configuration);

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
