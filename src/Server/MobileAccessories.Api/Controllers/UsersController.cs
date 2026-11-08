using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using MobileAccessories.Api.DTOs;
using MobileAccessories.Api.Models;
using MobileAccessories.Api.Security;

namespace MobileAccessories.Api.Controllers;

[ApiController]
[Authorize(Roles = AppRoles.Admin)]
[Route("api/users")]
public sealed class UsersController : ControllerBase
{
    private readonly UserManager<AppUser> _userManager;

    public UsersController(UserManager<AppUser> userManager)
    {
        _userManager = userManager;
    }

    [HttpPost]
    public async Task<ActionResult<UserSummaryResponse>> CreateUser(
        CreateUserRequest request,
        CancellationToken cancellationToken)
    {
        var email = request.Email.Trim();
        if (await _userManager.FindByEmailAsync(email) is not null)
        {
            return Conflict(new ProblemDetails
            {
                Title = "An account with this email already exists.",
                Status = StatusCodes.Status409Conflict
            });
        }

        var user = new AppUser
        {
            UserName = email,
            Email = email,
            EmailConfirmed = true
        };

        var createResult = await _userManager.CreateAsync(user, request.TemporaryPassword);
        if (!createResult.Succeeded)
        {
            return BadRequest(new ValidationProblemDetails(
                createResult.Errors
                    .GroupBy(error => string.IsNullOrWhiteSpace(error.Code) ? "Password" : error.Code)
                    .ToDictionary(group => group.Key, group => group.Select(error => error.Description).ToArray())));
        }

        var roleResult = await _userManager.AddToRoleAsync(user, AppRoles.User);
        if (!roleResult.Succeeded)
        {
            await _userManager.DeleteAsync(user);
            return Problem(
                title: "The account could not be assigned its role.",
                statusCode: StatusCodes.Status500InternalServerError);
        }

        var roles = await _userManager.GetRolesAsync(user);
        return CreatedAtAction(nameof(GetUser), new { id = user.Id }, new UserSummaryResponse
        {
            Id = user.Id,
            Email = user.Email ?? email,
            Roles = roles.OrderBy(role => role).ToArray()
        });
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<UserSummaryResponse>> GetUser(string id)
    {
        var user = await _userManager.FindByIdAsync(id);
        if (user is null)
        {
            return NotFound();
        }

        var roles = await _userManager.GetRolesAsync(user);
        return Ok(new UserSummaryResponse
        {
            Id = user.Id,
            Email = user.Email ?? string.Empty,
            Roles = roles.OrderBy(role => role).ToArray()
        });
    }
}
