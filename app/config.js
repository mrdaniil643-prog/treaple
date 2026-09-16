// Подставьте значения из Supabase → Project Settings → Data API.
// Ключ anon публичный по замыслу: он не даёт прав сам по себе, доступ
// решают политики Row Level Security в базе. Service role key сюда
// класть нельзя ни при каких условиях — он обходит все политики.
window.TREAPLE_CONFIG = {
  url:     "",   // https://xxxxxxxxxxxx.supabase.co
  anonKey: ""    // eyJhbGciOi...
};
