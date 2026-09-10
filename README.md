# Treaple — учёт товарных остатков

Нативное iOS-приложение (SwiftUI + SwiftData + CloudKit) для магазина: заменяет
таблицу в Google Sheets, но работает как обычное приложение с iPhone — офлайн,
с фотографиями товаров, поиском, дашбордом и виджетом.

Требования: **Xcode 15+**, **iOS 17.0+**.

---

## Что внутри

| Экран | Файлы |
|---|---|
| Список товаров | `Treaple/Inventory/` |
| Карточка товара (создание/правка) | `Treaple/Editor/` |
| Подробности товара | `Treaple/Detail/` |
| Дашборд (Swift Charts) | `Treaple/Dashboard/` |
| Настройки, iCloud, экспорт CSV | `Treaple/Settings/` |
| Модель, хранилище, дизайн-система | `TreapleShared/` |
| Виджет «Мало на складе» | `TreapleWidget/` |

`TreapleShared/` собирается в **оба** таргета — приложение и виджет читают одну
и ту же базу и один и тот же набор цветов.

### Возможности

- **Список**: поиск, сегмент-фильтр «Все / Мало / Нет» со счётчиками,
  4 варианта сортировки с переключением направления, сворачиваемые секции по
  категориям, свайпы (удалить / изменить / переключить наличие), контекстное
  меню, pull-to-refresh, пустые состояния.
- **Карточка**: фото из галереи или с камеры (сжимается до 1024 px перед
  записью), автодополнение категорий, **двусторонний калькулятор наценки**
  (наценка → цена продажи и обратно) с пресетами +20/30/50/100/150 %,
  валидация на лету, живой итог по прибыли и марже.
- **Дашборд**: сумма закупки, сумма продажи, потенциальная прибыль, маржа;
  график остатков по категориям (штуки/деньги); список позиций, требующих
  внимания.
- **Настройки**: статус iCloud с ручным обновлением, порог «мало на складе»
  (в том числе применение ко всем товарам), валюта, экспорт CSV через share
  sheet, тема (системная/светлая/тёмная).
- **Виджет**: `systemSmall`, `systemMedium` и два формата для экрана
  блокировки. Тап открывает список, уже отфильтрованный по «Мало»
  (`treaple://low-stock`).

---

## Настройка перед первым запуском

Проект открывается и собирается сразу, но для синхронизации через iCloud нужно
подставить свои идентификаторы. Всё делается в четырёх местах.

### 1. Team и Bundle ID

Xcode → таргет **Treaple** → *Signing & Capabilities*:

- **Team** — ваш Apple Developer аккаунт;
- **Bundle Identifier** — замените `com.treaple.inventory` на свой.

То же самое для таргета **TreapleWidgetExtension**: его идентификатор должен
быть *префиксом приложения* + суффикс, например `com.<ваш>.inventory.widget`.

### 2. CloudKit-контейнер

В *Signing & Capabilities* приложения включите **iCloud → CloudKit** и выберите
(или создайте) контейнер `iCloud.<ваш bundle id>`.

Затем пропишите его в двух местах:

- `Configuration/Treaple.entitlements` → ключ
  `com.apple.developer.icloud-container-identifiers`;
- `TreapleShared/AppSettingsStore.swift` → `cloudKitContainerID`.

Синхронизация начнёт работать автоматически, как только на устройстве выполнен
вход в iCloud, — отдельного логина в приложении нет. Приложение пишет в
**приватную** базу пользователя: данные не видны никому, кроме владельца
Apple ID.

> Пуш-уведомления о новых записях приходят в фоне, поэтому в
> `Configuration/Info-App.plist` включён `UIBackgroundModes: remote-notification`,
> а в entitlements — `aps-environment`. Перед публикацией смените
> `development` на `production`.

### 3. App Group

Виджет читает ту же базу, что и приложение, поэтому оба таргета должны состоять
в одной App Group.

Включите **App Groups** для *обоих* таргетов и создайте группу
`group.<ваш bundle id>`. Значение указывается в трёх местах:

- `Configuration/Treaple.entitlements`;
- `Configuration/TreapleWidget.entitlements`;
- `TreapleShared/AppSettingsStore.swift` → `appGroupID`.

Если App Group не настроена, приложение не упадёт: база уедет в
Application Support, но виджет покажет пустое состояние.

### 4. Иконка

`Treaple/Assets.xcassets/AppIcon.appiconset` пустой — положите туда PNG
1024×1024. Акцентный цвет уже задан в `AccentColor.colorset`.

---

## Модель данных

```swift
@Model final class Product {
    var id: UUID
    var name: String            // название
    var category: String        // бренд или группа
    @Attribute(.externalStorage) var imageData: Data?
    var purchasePrice: Double   // цена закупки
    var salePrice: Double       // цена продажи
    var quantity: Int           // остаток
    var lowStockThreshold: Int  // порог «мало», по умолчанию 3
    var inStock: Bool
    var createdAt: Date
    var updatedAt: Date
}
```

Схема совместима с CloudKit: **у каждого свойства есть значение по умолчанию**,
нет `@Attribute(.unique)` и обязательных связей — иначе SwiftData откажется
поднимать зеркалирование в CloudKit.

Фото лежит в `.externalStorage`: файл хранится рядом с базой, а в CloudKit
уезжает как `CKAsset`, не раздувая запись.

---

## Архитектура

- `PersistenceController` — единственное место, где собирается `ModelContainer`.
  Приложение открывает стор с `cloudKitDatabase: .private(...)`, виджет — тот же
  файл, но только на чтение и без CloudKit, чтобы не требовать лишних
  entitlements. Если CloudKit недоступен (симулятор без iCloud, не настроен
  capability), контейнер молча откатывается на локальный режим.
- `ProductStore` — все изменения товаров: обновляет `updatedAt`, сохраняет
  контекст и дёргает `WidgetCenter.reloadTimelines`.
- `InventoryViewModel` — поиск, фильтр, сортировка, свёрнутые секции; чистые
  функции над массивом из `@Query`.
- `ProductDraft` — состояние формы редактора: хранит строки как их ввёл
  пользователь («1,5» и «1.5» равнозначны), считает наценку в обе стороны и
  валидирует поля.
- `CloudSyncMonitor` — слушает `NSPersistentCloudKitContainer.eventChangedNotification`
  (SwiftData работает поверх него) и статус аккаунта iCloud.
- `DesignSystem.swift` — палитра, метрики, тени и пружины. Цвета адаптивные:
  собираются через `UIColor` с динамическим провайдером, поэтому корректно
  переключаются между светлой и тёмной темой.

## Локализация

Основной язык — русский (`developmentRegion = ru`). Строки заданы литералами
в коде; чтобы добавить английский, выберите проект → *Product → Export
Localizations* и импортируйте перевод обратно —
`SWIFT_EMIT_LOC_STRINGS` и `LOCALIZATION_PREFERS_STRING_CATALOGS` уже включены.

## Экспорт CSV

Разделитель — точка с запятой, файл начинается с BOM: так Excel и Numbers в
русской локали открывают кириллицу и числа с десятичной запятой без бубна.
