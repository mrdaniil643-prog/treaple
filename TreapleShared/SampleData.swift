import Foundation

extension Product {
    /// Демо-данные: используются в превью и в пункте «Добавить примеры» на пустом экране.
    static var sampleProducts: [Product] {
        [
            Product(name: "Кроссовки Air Zoom", category: "Nike", purchasePrice: 6200, salePrice: 11900, quantity: 14, lowStockThreshold: 4),
            Product(name: "Худи Essentials", category: "Adidas", purchasePrice: 2800, salePrice: 5490, quantity: 3, lowStockThreshold: 5),
            Product(name: "Футболка Basic", category: "Adidas", purchasePrice: 700, salePrice: 1690, quantity: 42),
            Product(name: "Рюкзак Classic", category: "Herschel", purchasePrice: 3100, salePrice: 6900, quantity: 0, inStock: false),
            Product(name: "Носки высокие, 3 пары", category: "Nike", purchasePrice: 420, salePrice: 990, quantity: 2, lowStockThreshold: 6),
            Product(name: "Куртка Windrunner", category: "Nike", purchasePrice: 8400, salePrice: 15900, quantity: 7),
            Product(name: "Кепка Logo", category: "Herschel", purchasePrice: 900, salePrice: 2290, quantity: 19),
            Product(name: "Термокружка 500 мл", category: "Аксессуары", purchasePrice: 1150, salePrice: 2790, quantity: 1, lowStockThreshold: 3)
        ]
    }
}
