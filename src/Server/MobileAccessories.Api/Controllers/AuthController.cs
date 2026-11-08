using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using MobileAccessories.Api.DTOs;
using MobileAccessories.Api.Models;

namespace MobileAccessories.Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController : ControllerBase
{
    private readonly IAntiforgery _antiforgery;
    private readonly SignInManager<AppUser> _signInManager;
    private readonly UserManager<AppUser> _userManager;

    public AuthController(
        IAntiforgery antiforgery,
        SignInManager<AppUser> signInManager,
        UserManager<AppUser> userManager)
    {
        _antiforgery = antiforgery;
        _signInManager = signInManager;
        _userManager = userManager;
    }

    [AllowAnonymous]
    [HttpGet("csrf")]
    public ActionResult<CsrfTokenResponse> GetCsrfToken()
    {
        Response.Headers.CacheControl = "no-store";
        var tokens = _antiforgery.GetAndStoreTokens(HttpContext);
        return Ok(new CsrfTokenResponse { RequestToken = tokens.RequestToken ?? string.Empty });
    }

    [AllowAnonymous]
    [HttpPost("login")]
    public async Task<ActionResult<UserSummaryResponse>> Login(
        LoginRequest request,
        CancellationToken cancellationToken)
    {
        var email = request.Email.Trim();
        var user = await _userManager.FindByEmailAsync(email);

        if (user is null)
        {
            return Unauthorized(LoginProblem());
        }

        var signInResult = await _signInManager.PasswordSignInAsync(
            user,
            request.Password,
            isPersistent: false,
            lockoutOnFailure: true);

        if (!signInResult.Succeeded)
        {
            return Unauthorized(LoginProblem());
        }

        var roles = await _userManager.GetRolesAsync(user);
        Response.Headers.CacheControl = "no-store";

        return Ok(new UserSummaryResponse
        {
            Id = user.Id,
            Email = user.Email ?? email,
            Roles = roles.OrderBy(role => role).ToArray()
        });
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<ActionResult<UserSummaryResponse>> GetCurrentUser(
        CancellationToken cancellationToken)
    {
        var user = await _userManager.GetUserAsync(User);
        if (user is null)
        {
            return Unauthorized();
        }

        var roles = await _userManager.GetRolesAsync(user);
        return Ok(new UserSummaryResponse
        {
            Id = user.Id,
            Email = user.Email ?? string.Empty,
            Roles = roles.OrderBy(role => role).ToArray()
        });
    }

    [Authorize]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await _signInManager.SignOutAsync();
        return NoContent();
    }

    private static ProblemDetails LoginProblem() => new()
    {
        Title = "Sign-in failed.",
        Detail = "The email or password is incorrect, or the account is temporarily locked.",
        Status = StatusCodes.Status401Unauthorized
    };
}
