# Artist Portfolio Template 설치 가이드

## 1. 구매 후 가장 먼저 바꿀 파일

루트의 `template-config.js` 파일에서 아래 항목을 수정합니다.

- `siteName`: 사이트 이름
- `artistName`: 작가명
- `adminEmail`: 관리자 이메일
- `supabaseUrl`: Supabase Project URL
- `supabasePublishableKey`: Supabase Publishable Key
- `imagekitBaseUrl`: ImageKit URL endpoint
- `imagekitPublicKey`: 구매자 ImageKit public key
- `imagekitFolder`: 구매자 이미지 보관 폴더

관리자 이메일은 Vercel의 `ADMIN_EMAIL` 환경변수와 반드시 동일하게 맞춥니다.

## 2. Vercel 환경변수

Vercel 프로젝트의 Settings > Environment Variables에 아래 값을 추가합니다.

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `ADMIN_EMAIL`
- `CROP_ACCESS_PASSWORD`
- `IMAGEKIT_PRIVATE_KEY` — ImageKit 업로드를 사용할 때만

샘플은 `.env.example`을 참고합니다.

## 3. Supabase 준비

구매자 본인의 새 프로젝트를 만들고 Authentication의 이메일 로그인을 활성화합니다.
관리자 이메일로 Auth 사용자를 만든 뒤 SQL Editor에서 아래 쿼리로 **id(UUID)**를 확인합니다.

```sql
select id, email from auth.users where email = 'admin@example.com';
```

`supabase-setup.sql`의 `REPLACE_WITH_ADMIN_USER_UUID`를 해당 id로 교체하여 **새 프로젝트에서만** 실행합니다. 이 파일이 아래 테이블과 공개 읽기/관리자 쓰기 접근 규칙을 만듭니다.

- Authentication > Email
- `site_settings` 테이블
- `works` 테이블
- `news_items` 테이블
- `exhibitions` 테이블
- `contact_items` 테이블

기존 사이트의 데이터베이스와 연결하지 말고 구매자별 새 프로젝트를 사용합니다. 관리자 계정의 UUID를 다른 계정으로 바꿀 때는 SQL의 관리자 정책도 새 UUID로 다시 설정해야 합니다.

## 4. 관리자 로그인

처음에는 Vercel의 `CROP_ACCESS_PASSWORD`에 넣은 비밀번호로 로그인합니다. 관리자 이메일 계정의 이메일 확인이 필요한 경우 인증 메일을 완료한 후 로그인합니다.

관리자 이메일은 `ADMIN_EMAIL`과 `template-config.js > adminEmail`이 같아야 합니다.

로그인 화면의 **비밀번호를 잊으셨나요?**를 누르면 Supabase Auth를 이용해 관리자 이메일로 재설정 링크를 보냅니다.

Supabase Authentication의 Redirect URLs에는 실제 사이트 주소의 아래 경로를 허용합니다.

`https://YOUR-DOMAIN/admin.html?recovery=1`

## 5. 책 소개

관리자 > 책 소개 관리에서 **홈페이지에 책 소개 표시**를 켜거나 끌 수 있습니다.

- 끔: 홈페이지에서 책 소개 메뉴만 숨김
- 기존에 등록한 책 데이터는 삭제되지 않음
- 다시 켜면 기존 책이 그대로 표시됨

## 6. 샘플 데이터

처음 설치하면 데모 확인을 위해 샘플 작가, 작품, 책이 표시됩니다.

실제 Supabase 데이터를 등록하면 작품 영역은 등록 데이터 기준으로 동작합니다.

## 7. 판매본에서 제거한 기능

이 템플릿은 작가 포트폴리오용으로 정리되어 다음 복작소 전용 기능을 포함하지 않습니다.

- 복작소 쇼핑몰
- 키링 상품 페이지
- 의약품 도구
- 기존 복작소 도메인/검색엔진 인증 정보

## 8. 권장 설치 순서

1. GitHub 저장소 복제
2. Vercel 연결
3. 구매자 명의의 Supabase와 ImageKit 프로젝트 생성
4. `template-config.js`에 구매자 키와 브랜드 입력
5. Vercel 환경변수 입력 후 배포
6. Supabase Auth 관리자 계정 생성 및 UUID 확인
7. `supabase-setup.sql`의 UUID 교체 후 새 프로젝트에서 실행
8. Supabase Auth Redirect URL 등록
9. 관리자 로그인, 작품 등록, 책 소개 저장 확인
10. 샘플 데이터와 기본 이미지를 본인 콘텐츠로 교체
11. 커스텀 도메인 연결

## 판매 전 확인 상태

이 파일은 설치 초안입니다. 별도의 새 Supabase·ImageKit·Vercel 계정에서 전체 설치 및 저장 흐름을 아직 실증하지 않았습니다. 판매 안내에서 설치 검증 완료라고 표시하지 마세요.
