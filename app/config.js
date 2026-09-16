// Значения из Supabase → Project Settings → API Keys.
//
// Ключ publishable (прежнее название — anon public) публичный по замыслу:
// прав он сам по себе не даёт, доступ к каждой строке решают политики Row
// Level Security в базе. Поэтому он лежит здесь открыто и попадает в
// репозиторий — так и задумано.
//
// Ключ secret (sb_secret_... / service_role) сюда класть нельзя ни при
// каких условиях: он обходит все политики.
window.TREAPLE_CONFIG = {
  url:     "https://pjvvdkaqgzudlhhzhoey.supabase.co",
  anonKey: "sb_publishable_eKnH3uoY1z20QnYosAsXzw_4f0DOCqu"
};
