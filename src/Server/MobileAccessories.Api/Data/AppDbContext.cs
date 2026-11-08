using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using MobileAccessories.Api.Models;
namespace MobileAccessories.Api.Data
{
    public class AppDbContext : IdentityDbContext<AppUser>
    {
        public AppDbContext(DbContextOptions<AppDbContext> options)
         : base(options)
        {
        }

        public DbSet<Product> Products => Set<Product>();

        public DbSet<Category> Categories => Set<Category>();

        public DbSet<Invoice> Invoices => Set<Invoice>();

        public DbSet<InvoiceLine> InvoiceLines => Set<InvoiceLine>();

        public DbSet<StockMovement> StockMovements => Set<StockMovement>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            modelBuilder.Entity<AppUser>()
                .HasIndex(user => user.NormalizedEmail)
                .HasDatabaseName("EmailIndex")
                .IsUnique()
                .HasFilter("[NormalizedEmail] IS NOT NULL");

            modelBuilder.Entity<Category>(entity =>
            {
                entity.HasKey(c => c.Id);

                entity.Property(c => c.Name)
                    .IsRequired()
                    .HasMaxLength(100);

                entity.Property(c => c.Description)
                    .HasMaxLength(500);

                entity.Property(c => c.CreatedBy)
                    .HasMaxLength(100);

                entity.Property(c => c.UpdatedBy)
                    .HasMaxLength(100);

                entity.Property(c => c.RowVersion)
                    .IsRowVersion();

                entity.HasIndex(c => c.Name)
                    .IsUnique();

                entity.HasData(new Category
                {
                    Id = 1,
                    Name = "Uncategorized",
                    Description = "Default category until product categories are configured.",
                    IsActive = true,
                    CreatedAtUtc = new DateTime(2026, 11, 7, 0, 0, 0, DateTimeKind.Utc),
                    CreatedBy = "system"
                });
            });

            modelBuilder.Entity<Product>(entity =>
            {
                entity.HasKey(p => p.Id);

                entity.HasOne(p => p.Category)
                    .WithMany(c => c.Products)
                    .HasForeignKey(p => p.CategoryId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasIndex(p => p.CategoryId);

                entity.Property(p => p.Name)
                    .IsRequired()
                    .HasMaxLength(150);

                entity.Property(p => p.Brand)
                    .HasMaxLength(100);

                entity.Property(p => p.Model)
                    .HasMaxLength(100);

                entity.Property(p => p.Sku)
                    .HasMaxLength(50);

                entity.Property(p => p.HSNCode)
                    .HasMaxLength(20);

                entity.Property(p => p.Barcode)
                    .HasMaxLength(100);

                entity.HasIndex(p => p.Barcode)
                    .IsUnique()
                    .HasFilter("[Barcode] IS NOT NULL");

                entity.HasIndex(p => p.Sku)
                    .IsUnique()
                    .HasFilter("[Sku] IS NOT NULL");

                entity.Property(p => p.Unit)
                    .HasMaxLength(20)
                    .IsRequired();

                entity.Property(p => p.PurchasePrice)
                    .HasPrecision(18, 2);

                entity.Property(p => p.SalePrice)
                    .HasPrecision(18, 2);

                entity.Property(p => p.CurrentStock)
                    .HasPrecision(18, 3)
                    .HasDefaultValue(0m);

                entity.Property(p => p.MinimumStock)
                    .HasPrecision(18, 3)
                    .HasDefaultValue(0m);

                entity.Property(p => p.CreatedBy)
                    .HasMaxLength(100);

                entity.Property(p => p.UpdatedBy)
                    .HasMaxLength(100);

                entity.Property(p => p.RowVersion)
                    .IsRowVersion();
            });

            modelBuilder.Entity<Invoice>(entity =>
            {
                entity.HasKey(invoice => invoice.Id);
                entity.Property(invoice => invoice.InvoiceNumber).IsRequired().HasMaxLength(32);
                entity.HasIndex(invoice => invoice.InvoiceNumber).IsUnique();
                entity.Property(invoice => invoice.CustomerName).HasMaxLength(150);
                entity.Property(invoice => invoice.CustomerPhone).HasMaxLength(20);
                entity.Property(invoice => invoice.Notes).HasMaxLength(500);
                entity.Property(invoice => invoice.CreatedByUserId).IsRequired().HasMaxLength(450);
                entity.Property(invoice => invoice.CreatedByEmail).IsRequired().HasMaxLength(256);
                entity.Property(invoice => invoice.Total).HasPrecision(18, 2);
                entity.HasMany(invoice => invoice.Lines).WithOne(line => line.Invoice)
                    .HasForeignKey(line => line.InvoiceId).OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<InvoiceLine>(entity =>
            {
                entity.HasKey(line => line.Id);
                entity.Property(line => line.ProductName).IsRequired().HasMaxLength(150);
                entity.Property(line => line.Barcode).HasMaxLength(100);
                entity.Property(line => line.Unit).IsRequired().HasMaxLength(20);
                entity.Property(line => line.Quantity).HasPrecision(18, 3);
                entity.Property(line => line.UnitPrice).HasPrecision(18, 2);
                entity.Property(line => line.LineTotal).HasPrecision(18, 2);
                entity.HasOne(line => line.Product).WithMany().HasForeignKey(line => line.ProductId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<StockMovement>(entity =>
            {
                entity.HasKey(movement => movement.Id);
                entity.Property(movement => movement.QuantityChange).HasPrecision(18, 3);
                entity.Property(movement => movement.StockAfter).HasPrecision(18, 3);
                entity.Property(movement => movement.Reason).IsRequired().HasMaxLength(250);
                entity.Property(movement => movement.CreatedByEmail).IsRequired().HasMaxLength(256);
                entity.HasOne(movement => movement.Product).WithMany().HasForeignKey(movement => movement.ProductId)
                    .OnDelete(DeleteBehavior.Restrict);
                entity.HasOne(movement => movement.Invoice).WithMany().HasForeignKey(movement => movement.InvoiceId)
                    .OnDelete(DeleteBehavior.Restrict);
                entity.HasIndex(movement => new { movement.ProductId, movement.CreatedAtUtc });
                entity.HasIndex(movement => movement.InvoiceId);
            });
        }
    }
}
