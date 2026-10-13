# 복작소 일반회원 승인제 (SMS 제외) — 운영 인계 및 배포 체크리스트

상태: **코드 작성·비파괴적 DB 추가 완료 / 서비스 가입접수 비활성화 / 운영 배포 대기** (2026-10-13)
**기존 서비스 및 채팅 기능은 비활성화 상태에서 영향받지 않도록 구성됨.**

## 최종 요구사항

- 신규 회원: 이름(비공개) + 닉네임(채팅에 공개) + 휴대전화(비공개, **검증하지 않음**) + 프로필 사진(선택) + 개인정보 동의 → 관리자 승인 대기 → 승인 후 일반 채팅방 이용.
- 일반 회원의 승인과 **복작소 클럽 승인은 별도**. 클럽은 두 승인이 모두 있어야 이용 가능.
- 과거 회원·대화·채팅방·클럽 승인·사진/프로필 보존. 기존 사용자에게 가입 신청 다시 요구하지 않음.
- SMS 발송·OTP 인증은 구현/청구하지 않음. 관리자 전화번호 확인은 오직 운영 정책으로 처리.

## 구현 코드

- 일반회원 서버 권한: \`lib/member-access.js\`. 기존 DB 승인된 공통 프로필 또는 기존 실제 채팅방 토큰을 보유한 사용자만 허용. 보호 대상: \`chat-join\`, 기존 세션의 \`chat-list\`, \`chat-send\`, 사진 업로드, 알림 및 메타데이터 변경. 서버 API 검증, 프론트 화면만 막지 않음.
- 일반회원 신청·관리자 승인 API: \`lib/member-handler.js\`; \`api/store-inquiries.js\`에서 \`member-status\`, \`member-register\`; \`api/content-admin.js\`에서 \`member-admin-list\`, \`member-admin-review\`.
- 클럽 별도 승인: \`lib/club-handler.js\` 일반 회원도 승인되었는지 검증한 후 기존 클럽 검증 수행.
- 회원가입 UI: \`chat-pwa/register.html\` (전화번호는 미인증 표시, 수집/이용 동의, 상태 표시, 프로필 사진 업로드, 승인 확인).
- 관리자 UI: \`chat-pwa/member-admin.html\` (이름/닉네임/마스킹 휴대전화, 승인·거절·정지, 기존 회원 구분), \`chat-pwa/chat-admin.html\` 메뉴 연결.
- 메인 화면: \`chat-pwa/index.html\`에 상태별 회원가입 링크, 채팅 화면 \`chat-pwa/chat.html\` 미승인 리디렉션.
- 기존 PWA 앱 ID/홈화면 설치, 방 코드·비밀번호, 대화 데이터/클럽 테이블 삭제/수정 없음.

## DB 적용 완료

Supabase 프로젝트 \`wonju-portfolio\` (\`vefeplfczeztbplowjmj\`)에 **추가만** 실행:
- \`bokjakso_registration_config\`: \`enabled=false\` (안전장치)
- \`bokjakso_memberships\`: 승인 상태, 기존 여부
- \`bokjakso_member_private\`: AES-256-GCM 암호문 이름·번호, 번호 끝 네자리/미인증 표시
- \`bokjakso_legacy_chat_members\`: 이전 세션 증빙 스냅샷
- \`bokjakso_registration_attempts\`: 24시간/IP 신청 횟수 제한
- 최초 스냅샷: 기존 \`chat_profiles\` 3개 승인·보존, 기존 \`chat_members\` 9개 보존.
- RLS 활성화, 일반 \`anon\` 차단, 서버의 서비스키 또는 기존 Supabase 운영자 계정 \`bokjakso.shop@gmail.com\`만 접근.
- **어떤 기존 메시지나 방 레코드도 삭제하지 않음.**

## 미완료 / 출시 차단 (해결 필수)

1. **Vercel 당일 배포 제한(402, free-per-day)**으로 현재 GitHub 최신 소스가 운영 사이트에 아직 반영되지 않았음.
   - 배포 제한이 풀리면 **두 프로젝트 모두** 최신 커밋을 production에 배포:
     \`karisma-s-projects1/wjarchive\` (API 및 bokjakso.com)
     \`karisma-s-projects1/bokjakso-chat-pwa\` (PWA)
   - 한쪽만 READY라고 서비스 가능하다고 말하지 말고 두쪽과 API 연동 실사용을 확인할 것.
2. **개인정보 암호화키 \`BOKJAKSO_MEMBER_DATA_KEY\`**: production 환경변수에 32바이트 난수의 hex 문자열 64자를 \`encrypted\` 타입으로 추가해야 함.
   - 이를 설정하는 도구 요청이 Vercel **403 권한 부족**으로 실패함. 필요한 팀 프로젝트 권한을 운영자가 확인해야 함.
   - 값을 절대로 웹페이지/커밋/ChatGPT 메시지에 붙여넣지 말 것.
   - 키가 없으면 서버는 이름·전화번호를 저장하지 않고 503으로 실패하게 함.
3. **개인정보 처리자 고지 확인**: 복작소 운영자 실제 표시명, 연락 이메일, 수집·이용 목적, 보유기간, 처리위탁/국외이전 대상 및 삭제·탈퇴 절차를 운영자가 확인해야 함. 현재 등록 UI의 인라인 안내는 운영 확정 전 문구임.
4. **회귀/보안 테스트**: 신규 회원 폼→pending→관리자 승인→채팅→클럽 별도 승인; 거절·정지 후 기존 세션으로 API 우회 차단; 기존 회원/초대·푸시/사진/채팅 기록 보존; 개인정보 접근 RLS 테스트. 민감 실데이터로 테스트 금지.
5. 1~4 완료 후 **별도 승인 시**:
   \`update public.bokjakso_registration_config set enabled=true,updated_at=now() where singleton=true;\`
   를 실행해 활성화. 반대로 \`enabled=false\`로 즉시 롤백 가능 (회원 테이블/채팅 데이터 삭제 금지).
6. SMS 인증은 의도적으로 없음. 전화번호는 **본인 확인/중복 실명 인증 수단이 아님**.

## 운영 세부 주의

- 기존 프로필을 삭제하거나 회원 기록을 재생성하지 말고 최초 migration 당시 snapshot을 보존.
- API 부하를 고려한 \`enabled\` 설정 캐시 시간은 5초; 정지 직후 기존 세션은 요청별 회원 상태를 별도 조회하므로 승인권한은 바로 적용.
- 관리자 토큰은 기존 운영자 로그인 체계와 연결; 승인값은 클라이언트가 지정할 수 없음.
- 개인정보는 URL, 공개 채팅 응답, PWA 서비스워커 캐시, localStorage에 저장하지 않음. 로컬에는 기존 프로필 인증 토큰만 보존.
- 새로운 가입을 운영하기 전에는 문자 미인증에 따른 악의적 가입/번호 도용 위험을 안내해야 함.
