window.ARTIST_TEMPLATE_CONFIG = Object.freeze({
  siteName: 'Artist Portfolio',
  artistName: 'Sample Artist',
  adminEmail: 'admin@example.com',

  // Supabase > Project Settings > API에서 복사해 입력하세요.
  // 비워두면 데모 샘플 데이터만 표시됩니다.
  supabaseUrl: '',
  supabasePublishableKey: '',

  // ImageKit을 사용할 경우 URL endpoint를 입력하세요.
  // 예: https://ik.imagekit.io/your_id
  imagekitBaseUrl: '',

  // 일반적으로 수정할 필요가 없습니다.
  adminRecoveryRedirect: (window.location.origin || '') + '/admin.html?recovery=1',
  adminTokenStorageKey: 'artistTemplateAdminAccessToken'
});
