const STYLE = "body{font-family:sans-serif;line-height:1.5;max-width:42rem;margin:2rem auto;padding:0 1rem;color:#1a1a1a}a{color:#0b57d0}";

export function renderPage({ path = "/", sandbox = null } = {}) {
  const pages = {
    "/": pricePage(),
    "/price": pricePage(),
    "/purchase": purchasePage(),
    "/success": successPage(),
    "/failure": failurePage(),
    "/restore": restorePage(),
    "/restore/done": restoreDonePage(),
    "/privacy": privacyPage(),
    "/terms": termsPage(),
    "/refund": refundPage(),
    "/sandbox": sandboxPage(sandbox)
  };
  return pages[path] || missingPage();
}

function documentPage(title, body) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${STYLE}</style></head><body>${body}</body></html>`;
}

function pricePage() {
  return documentPage("Dot Copy Paste 가격", `
    <h1>Dot Copy Paste</h1>
    <p>복사와 붙여넣기 안내는 무료입니다. 판매 대상은 불러온 닷 대화의 내보내기이며, 일회성 4,900원입니다. 월 구독과 자동 갱신은 없습니다.</p>
    <p>대화 전체 내보내기는 실제 Dots 화면에서 누락, 중복, 순서가 확인되기 전에는 판매 기능으로 제공하지 않습니다.</p>
    <p>판매는 준비 중입니다. 이 페이지에서 실결제가 시작되지 않습니다.</p>
    <p><a href="/purchase">구매 안내</a> · <a href="/restore">구매 복원</a> · <a href="/privacy">개인정보처리방침</a> · <a href="/terms">이용약관</a> · <a href="/refund">환불 안내</a></p>`);
}

function purchasePage() {
  return documentPage("구매 안내", `
    <h1>구매</h1>
    <p>Pro는 일회성 4,900원입니다. 판매자가 Google이 아니라 확장프로그램 개발자입니다.</p>
    <p><strong>판매 준비 중</strong>입니다. 이 버튼은 결제 페이지를 열지 않습니다.</p>
    <p><button type="button" disabled>판매 준비 중</button></p>
    <p>Sandbox 결제 연결은 공개 구매 버튼과 분리되어 있습니다. 테스트 결제 화면이 연결되어 있을 때만 <a href="/sandbox">Sandbox 결제</a>를 사용합니다.</p>
    <p><a href="/price">가격</a></p>`);
}

function successPage() {
  return documentPage("결제 화면이 끝났습니다", `
    <h1>결제 화면이 끝났습니다</h1>
    <p>이 화면은 Pro를 활성화하지 않습니다. 구매 권한은 서명된 결제 알림을 서버가 확인한 뒤에만 기록됩니다.</p>
    <p>결제에 실패했거나 취소된 경우에는 권한이 생기지 않습니다.</p>
    <p><a href="/restore">구매 상태 복원</a></p>`);
}

function failurePage() {
  return documentPage("결제가 완료되지 않았습니다", `
    <h1>결제가 완료되지 않았습니다</h1>
    <p>실패한 결제나 취소된 결제는 구매 권한을 만들지 않습니다. 이 화면도 권한을 만들지 않습니다.</p>
    <p><a href="/purchase">구매 안내</a></p>`);
}

function restorePage() {
  return documentPage("구매 복원", `
    <h1>구매 복원</h1>
    <p>결제에 사용한 이메일로 일회용 링크를 보냅니다. 링크는 15분 동안 한 번만 사용할 수 있습니다. 이메일을 입력하는 것만으로 권한이 생기지 않습니다.</p>
    <form method="post" action="/api/restore">
      <label>이메일 <input name="email" type="email" autocomplete="email" required maxlength="254"></label>
      <button type="submit">복원 링크 요청</button>
    </form>
    <p id="restore-result"></p>`);
}

function restoreDonePage() {
  return documentPage("복원 링크를 확인했습니다", `
    <h1>이 브라우저에서 구매 기록을 확인합니다</h1>
    <p>링크 확인은 새 결제를 만들지 않습니다. 이미 서버에 기록된 구매만 이 브라우저의 확장프로그램이 조회할 수 있습니다.</p>
    <p>판매가 준비 중인 동안에는 대화 전체 내보내기가 열리지 않습니다.</p>`);
}

function privacyPage() {
  return documentPage("개인정보처리방침", `
    <h1>개인정보처리방침</h1>
    <p>확장프로그램은 대화 내용, 클립보드, 첨부파일을 이 서버로 보내지 않습니다.</p>
    <p>구매가 연결되면 서버는 계정 토큰의 해시, 계정 식별자, 결제 이메일 해시, 주문 번호, 결제 알림 식별자, 금액, 통화, 권한 상태를 저장합니다. 이메일 원문과 대화 내용은 구매 복원 기록에 넣지 않습니다.</p>
    <p>결제 성공 화면만으로 권한을 저장하지 않습니다. 삭제 요청은 connect.geniusbrain@gmail.com 으로 보낼 수 있습니다.</p>`);
}

function termsPage() {
  return documentPage("이용약관", `
    <h1>이용약관</h1>
    <p>복사와 붙여넣기 안내는 무료입니다. 불러온 메시지 내보내기는 별도 일회성 4,900원 기능이며 현재 판매 준비 중입니다.</p>
    <p>대화 전체 내보내기는 실제 Dots 화면 검증 전에 판매하지 않습니다. 이후 기능이 이 구매에 자동으로 포함되지는 않습니다.</p>
    <p>판매자는 확장프로그램 개발자이며 Google이 아닙니다. 월 구독은 없습니다.</p>
    <p><a href="/refund">환불 안내</a></p>`);
}

function refundPage() {
  return documentPage("환불 안내", `
    <h1>환불 안내</h1>
    <p>실결제 판매는 시작되지 않았습니다. 이 버전에서 받지 않은 결제에 대한 환불은 없습니다.</p>
    <p>Sandbox 결제가 연결되면, 서명된 환불 또는 결제 취소 알림이 해당 계정의 구매 권한을 해제합니다. 서버 장애는 환불로 처리하지 않습니다.</p>
    <p>결제 성공 화면이나 이메일 주소만으로 권한을 유지하거나 복구하지 않습니다.</p>`);
}

function sandboxPage(sandbox) {
  const connected = Boolean(sandbox?.clientToken && sandbox?.priceId && sandbox.environment === "sandbox");
  const setup = connected
    ? `<p>Sandbox 상품과 일회성 4,900원 가격이 연결되어 있습니다. 이 화면은 실결제 계정이 아닙니다.</p>
       <p id="sandbox-tax">세금 포함 여부와 한국 구매자 최종 청구액은 결제 화면의 합계로 확인합니다.</p>
       <button type="button" id="sandbox-pay">Sandbox 테스트 결제</button>
       <script src="https://cdn.paddle.com/paddle/v2/paddle.js"></script>
       <script>
         Paddle.Environment.set("sandbox");
         Paddle.Initialize({ token: ${JSON.stringify(sandbox.clientToken)}, checkout: { settings: { displayMode: "overlay", successUrl: ${JSON.stringify(sandbox.successUrl)} } } });
         document.querySelector("#sandbox-pay").addEventListener("click", async () => {
           const session = await fetch("/api/session", { method: "POST" }).then((response) => response.json());
           if (!session.accountId) return;
           Paddle.Checkout.open({ items: [{ priceId: ${JSON.stringify(sandbox.priceId)}, quantity: 1 }], customData: { accountId: session.accountId } });
         });
       </script>`
    : `<p>Sandbox 상품이 아직 연결되지 않았습니다. 실결제처럼 처리하지 않습니다.</p>`;
  return documentPage("Sandbox 결제", `<h1>Sandbox 결제</h1>${setup}<p><a href="/purchase">공개 구매 화면은 판매 준비 중으로 유지됩니다.</a></p>`);
}

function missingPage() {
  return documentPage("페이지 없음", `<h1>페이지 없음</h1><p><a href="/price">가격</a></p>`);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[character]));
}
