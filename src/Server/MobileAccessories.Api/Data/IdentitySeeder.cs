using Microsoft.AspNetCore.Identity;
using MobileAccessories.Api.Models;
using MobileAccessories.Api.Security;

namespace MobileAccessories.Api.Data;

public static class IdentitySeeder
{
    public static async Task SeedAsync(IServiceProvider services, IConfiguration configuration)
    {
        using var scope = services.CreateScope();
        var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>()
            .CreateLogger("IdentitySeeder");

        foreach (var roleName in new[] { AppRoles.Admin, AppRoles.User })
        {
            if (!await roleManager.RoleExistsAsync(roleName))
            {
                var result = await roleManager.CreateAsync(new IdentityRole(roleName));
                if (!result.Succeeded)
                {
                    throw new InvalidOperationException($"Could not create the required '{roleName}' role.");
                }
            }
        }

        if ((await userManager.GetUsersInRoleAsync(AppRoles.Admin)).Count > 0)
        {
            return;
        }

        var adminEmail = configuration["BootstrapAdmin:Email"]?.Trim();
        var adminPassword = configuration["BootstrapAdmin:Password"];

        if (string.IsNullOrWhiteSpace(adminEmail) && string.IsNullOrWhiteSpace(adminPassword))
        {
            logger.LogWarning(
                "No bootstrap admin is configured. Set BootstrapAdmin:Email and BootstrapAdmin:Password in a private configuration source before signing in.");
            return;
        }

        if (string.IsNullOrWhiteSpace(adminEmail) || string.IsNullOrWhiteSpace(adminPassword))
        {
            throw new InvalidOperationException(
                "Both BootstrapAdmin:Email and BootstrapAdmin:Password must be configured together.");
        }

        if (await userManager.FindByEmailAsync(adminEmail) is not null)
        {
            throw new InvalidOperationException(
                "The bootstrap email already belongs to a non-admin account. Choose another email or use an existing Admin account.");
        }

        var admin = new AppUser
        {
            UserName = adminEmail,
            Email = adminEmail,
            EmailConfirmed = true
        };

        var createResult = await userManager.CreateAsync(admin, adminPassword);
        if (!createResult.Succeeded)
        {
            var messages = string.Join("; ", createResult.Errors.Select(error => error.Description));
            throw new InvalidOperationException($"Could not create the bootstrap admin account: {messages}");
        }

        var roleResult = await userManager.AddToRoleAsync(admin, AppRoles.Admin);
        if (!roleResult.Succeeded)
        {
            await userManager.DeleteAsync(admin);
            throw new InvalidOperationException("Could not assign the bootstrap admin account its role.");
        }

        logger.LogInformation("Created the initial Admin account {AdminEmail}.", adminEmail);
    }
}
