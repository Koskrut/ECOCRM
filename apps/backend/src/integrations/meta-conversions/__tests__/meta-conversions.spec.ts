import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UserRole } from "@prisma/client";
import { ROLES_KEY } from "../../../auth/roles.decorator";
import { metaGraphApiVersion, sha256Hex } from "../../meta-audiences/meta-audience.normalize";
import { MetaConversionsController } from "../meta-conversions.controller";
import { normalizePixelId } from "../meta-conversions.config";
import {
  contactEventId,
  isPromoView,
  maybeTrackStartContact,
  notifyMetaAddToCart,
  notifyMetaPurchase,
  resolveStartContact,
} from "../meta-conversions.events";
import { clientIpFromRequest } from "../meta-conversions.match";
import { MetaConversionsService } from "../meta-conversions.service";
import { DEFAULT_META_PIXEL_ID, META_CONVERSIONS_SETTING_ID } from "../meta-conversions.types";

const TOKEN = "EAAAsecretvalue1234567890";
const PHONE = "+380501112233";

type Call = { url: string; init: RequestInit };

function memoryPrisma(initial?: unknown) {
  let value: unknown = initial ?? null;
  return {
    systemSetting: {
      findUnique: async () => (value == null ? null : { id: META_CONVERSIONS_SETTING_ID, value }),
      upsert: async (args: { create: { value: unknown }; update: { value: unknown } }) => {
        value = args.update?.value ?? args.create.value;
        return { id: META_CONVERSIONS_SETTING_ID, value };
      },
    },
  };
}

function harness(stored?: unknown) {
  const calls: Call[] = [];
  const service = new MetaConversionsService(memoryPrisma(stored) as never);
  service.fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
  }) as typeof fetch;
  return { service, calls };
}

async function enable(service: MetaConversionsService, extra?: { testEventCode?: string; enabled?: boolean }) {
  await service.update({
    accessToken: TOKEN,
    enabled: extra?.enabled ?? true,
    testEventCode: extra?.testEventCode ?? "",
    pixelId: DEFAULT_META_PIXEL_ID,
  });
}

function bodyOf(call: Call): { data: Array<Record<string, unknown>>; test_event_code?: string } {
  return JSON.parse(String(call.init.body)) as { data: Array<Record<string, unknown>>; test_event_code?: string };
}

describe("meta conversions", () => {
  it("sends Purchase after checkout with the order id", async () => {
    const { service, calls } = harness();
    await enable(service);
    const seen: string[] = [];
    await notifyMetaPurchase(
      {
        trackPurchase: async (input) => {
          seen.push(input.orderId);
          await service.trackPurchase(input);
        },
      },
      {
        orderId: "ord-42",
        value: 1500,
        currency: "USD",
        channel: "telegram",
        phone: PHONE,
        email: " Buyer@Example.com ",
        firstName: "Анна",
        lastName: "Коваль",
        externalId: "contact-1",
      },
    );
    assert.deepEqual(seen, ["ord-42"]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `https://graph.facebook.com/${metaGraphApiVersion()}/${DEFAULT_META_PIXEL_ID}/events`);
    assert.equal(calls[0].url.includes(TOKEN), false);
    const header = new Headers(calls[0].init.headers);
    assert.equal(header.get("authorization"), `Bearer ${TOKEN}`);
    const event = bodyOf(calls[0]).data[0];
    assert.equal(event.event_name, "Purchase");
    assert.equal(event.event_id, "ord-42");
    assert.equal(event.action_source, "website");
    assert.equal(event.event_source_url, "https://www.suprex.dental/checkout");
    const custom = event.custom_data as Record<string, unknown>;
    assert.equal(custom.value, 1500);
    assert.equal(custom.currency, "USD");
    assert.equal(custom.content_type, "product");
    assert.equal(custom.channel, "telegram");
    const user = event.user_data as Record<string, string[]>;
    assert.deepEqual(user.ph, [sha256Hex("380501112233")]);
    assert.equal(JSON.stringify(event).includes(PHONE), false);
    assert.equal(JSON.stringify(event).includes("380501112233"), false);
    assert.equal(JSON.stringify(event).includes("buyer@example.com"), false);
    assert.equal("country" in user, false);

    await service.trackPurchase({
      orderId: "ord-42",
      value: 1500,
      currency: "USD",
      channel: "website",
    });
    assert.equal(calls.length, 1);
  });

  it("sends Purchase with ip, user agent and fbc built from fbclid", async () => {
    const { service, calls } = harness();
    await enable(service);
    const ip = clientIpFromRequest({
      ip: "10.0.0.8",
      headers: { "x-forwarded-for": "10.1.1.1, 203.0.113.10" },
    });
    assert.equal(ip, "203.0.113.10");
    await service.trackPurchase({
      orderId: "ord-match",
      value: 990,
      currency: "UAH",
      channel: "website",
      phone: PHONE,
      country: "UA",
      city: "Київ",
      region: "Київська область",
      zip: "01-001",
      clientIpAddress: ip,
      clientUserAgent: "Mozilla/5.0",
      fbclid: "IwAR123",
      eventSourceUrl: "https://www.suprex.dental/checkout?step=pay",
    });
    const event = bodyOf(calls[0]).data[0];
    const user = event.user_data as Record<string, unknown>;
    assert.equal(event.event_id, "ord-match");
    assert.equal(event.event_source_url, "https://www.suprex.dental/checkout?step=pay");
    assert.equal(user.client_ip_address, "203.0.113.10");
    assert.equal(user.client_user_agent, "Mozilla/5.0");
    assert.match(String(user.fbc), /^fb\.1\.\d+\.IwAR123$/);
    assert.equal("fbp" in user, false);
    assert.deepEqual(user.country, [sha256Hex("ua")]);
    assert.deepEqual(user.ct, [sha256Hex("київ")]);
    assert.deepEqual(user.st, [sha256Hex("київськаобласть")]);
    assert.deepEqual(user.zp, [sha256Hex("01001")]);
    const packed = JSON.stringify(event);
    assert.equal(packed.includes("Київ"), false);
    assert.equal(packed.includes("Хрещатик"), false);
    assert.equal(packed.includes(PHONE), false);

    await service.trackPurchase({
      orderId: "ord-plain",
      value: 10,
      currency: "UAH",
      channel: "website",
    });
    const plain = bodyOf(calls[1]).data[0].user_data as Record<string, unknown>;
    assert.equal("fbc" in plain, false);
    assert.equal("client_ip_address" in plain, false);
  });

  it("sends AddToCart and InitiateCheckout, and keeps Purchase on the order id", async () => {
    const { service, calls } = harness();
    await enable(service);
    const added = await service.trackAddToCart({
      eventId: "11111111-1111-1111-1111-111111111111",
      contentId: "SKU-1",
      contentName: "Бор",
      quantity: 2,
      itemPrice: 15,
      value: 30,
      currency: "usd",
      channel: "website",
      clientIpAddress: "203.0.113.10",
      clientUserAgent: "Mozilla/5.0",
      fbclid: "IwAR123",
      eventSourceUrl: "https://www.suprex.dental/product/1",
    });
    assert.equal(added.sent, true);
    const add = bodyOf(calls[0]).data[0];
    const addUser = add.user_data as Record<string, unknown>;
    const addCustom = add.custom_data as Record<string, unknown>;
    assert.equal(add.event_name, "AddToCart");
    assert.equal(add.event_id, "11111111-1111-1111-1111-111111111111");
    assert.equal(add.event_source_url, "https://www.suprex.dental/product/1");
    assert.equal(addCustom.value, 30);
    assert.equal(addCustom.currency, "USD");
    assert.equal(addCustom.num_items, 2);
    assert.deepEqual(addCustom.content_ids, ["SKU-1"]);
    assert.deepEqual(addCustom.contents, [{ id: "SKU-1", quantity: 2, item_price: 15 }]);
    assert.equal(addUser.client_ip_address, "203.0.113.10");
    assert.equal(addUser.client_user_agent, "Mozilla/5.0");
    assert.match(String(addUser.fbc), /^fb\.1\.\d+\.IwAR123$/);

    await service.trackAddToCart({
      eventId: "11111111-1111-1111-1111-111111111111",
      contentId: "SKU-1",
      quantity: 2,
      value: 30,
      currency: "USD",
      channel: "website",
    });
    assert.equal(calls.length, 1);

    const plain = await service.trackAddToCart({
      eventId: "33333333-3333-3333-3333-333333333333",
      contentId: "SKU-2",
      quantity: 1,
      value: 10,
      currency: "USD",
      channel: "website",
    });
    assert.equal(plain.sent, true);
    assert.equal("fbc" in (bodyOf(calls[1]).data[0].user_data as Record<string, unknown>), false);

    const skipped = await service.trackInitiateCheckout({
      eventId: "44444444-4444-4444-4444-444444444444",
      value: 10,
      currency: "USD",
    });
    assert.equal(skipped.sent, false);
    assert.equal(calls.length, 2);

    const started = await service.trackInitiateCheckout({
      eventId: "22222222-2222-2222-2222-222222222222",
      value: 120.2,
      currency: "USD",
      contentIds: ["SKU-1", "SKU-2"],
      numItems: 3,
      clientIpAddress: "203.0.113.10",
      clientUserAgent: "Mozilla/5.0",
      fbp: "fb.1.1.browser",
      eventSourceUrl: "https://www.suprex.dental/checkout?step=1",
    });
    assert.equal(started.sent, true);
    const checkoutEvent = bodyOf(calls[2]).data[0];
    const checkoutCustom = checkoutEvent.custom_data as Record<string, unknown>;
    const checkoutUser = checkoutEvent.user_data as Record<string, unknown>;
    assert.equal(checkoutEvent.event_name, "InitiateCheckout");
    assert.equal(checkoutEvent.event_id, "22222222-2222-2222-2222-222222222222");
    assert.equal(checkoutEvent.event_source_url, "https://www.suprex.dental/checkout?step=1");
    assert.equal(checkoutCustom.value, 120.2);
    assert.equal(checkoutCustom.currency, "USD");
    assert.equal(checkoutCustom.num_items, 3);
    assert.deepEqual(checkoutCustom.content_ids, ["SKU-1", "SKU-2"]);
    assert.equal(checkoutUser.fbp, "fb.1.1.browser");
    assert.equal("fbc" in checkoutUser, false);

    await service.trackPurchase({
      orderId: "ord-paid",
      value: 120,
      currency: "USD",
      channel: "website",
      contents: [
        { id: "SKU-1", quantity: 2, itemPrice: 15 },
        { id: "SKU-2", quantity: 1, itemPrice: 90 },
      ],
    });
    const purchase = bodyOf(calls[3]).data[0];
    const purchaseCustom = purchase.custom_data as Record<string, unknown>;
    assert.equal(purchase.event_name, "Purchase");
    assert.equal(purchase.event_id, "ord-paid");
    assert.deepEqual(purchaseCustom.content_ids, ["SKU-1", "SKU-2"]);
    assert.equal(purchaseCustom.num_items, 3);
    assert.equal(purchaseCustom.value, 120);

    await notifyMetaPurchase(
      {
        trackPurchase: async () => {
          throw new Error("meta down");
        },
      },
      { orderId: "ord-throw-2", value: 1, currency: "UAH", channel: "website" },
    );
  });

  it("sends Contact only for /start bf2026", async () => {
    const { service, calls } = harness();
    await enable(service);
    const tracked: string[] = [];
    const meta = {
      trackContact: async (input: { label: string; eventId: string }) => {
        tracked.push(input.label);
        await service.trackContact(input);
      },
    };
    await maybeTrackStartContact(meta, {
      text: "/start",
      updateId: "1",
      chatId: "9",
      isLinkToken: false,
    });
    await maybeTrackStartContact(meta, {
      text: "/start linktoken",
      updateId: "2",
      chatId: "9",
      isLinkToken: true,
    });
    await maybeTrackStartContact(meta, {
      text: "/start@SuprexBot bf2026",
      updateId: "3",
      chatId: "9",
      isLinkToken: false,
      phone: PHONE,
      externalId: "tg-user",
    });
    assert.deepEqual(tracked, ["bf2026"]);
    assert.equal(resolveStartContact("/start", false), null);
    assert.equal(resolveStartContact("/start linktoken", true), null);
    assert.equal(contactEventId("3", "9", "bf2026"), "tg-3");
    assert.equal(calls.length, 1);
    const event = bodyOf(calls[0]).data[0];
    assert.equal(event.event_name, "Contact");
    assert.notEqual(event.event_name, "Lead");
    assert.equal(event.event_id, "tg-3");
    assert.equal(event.action_source, "other");
    assert.equal("event_source_url" in event, false);
    const contactUser = event.user_data as Record<string, unknown>;
    assert.equal("client_ip_address" in contactUser, false);
    assert.equal("fbp" in contactUser, false);
    assert.equal("fbc" in contactUser, false);
    assert.equal((event.custom_data as { content_name: string }).content_name, "bf2026");
    assert.equal(JSON.stringify(event).includes(TOKEN), false);
  });

  it("does not send ViewContent from an ordinary page", async () => {
    const { service, calls } = harness();
    await enable(service);
    assert.equal(isPromoView("/catalog", ""), false);
    assert.equal(isPromoView("/", "?utm=ads"), false);
    const ordinary = await service.trackViewContent({ eventId: "vc-1", path: "/catalog", search: "" });
    assert.equal(ordinary.sent, false);
    assert.equal(calls.length, 0);

    const promo = await service.trackViewContent({
      eventId: "vc-bf",
      path: "/",
      search: "?promo=bf",
      clientIpAddress: "203.0.113.10",
      clientUserAgent: "Mozilla/5.0",
      fbclid: "IwAR123",
    });
    assert.equal(promo.sent, true);
    assert.equal(calls.length, 1);
    const event = bodyOf(calls[0]).data[0];
    const user = event.user_data as Record<string, unknown>;
    assert.equal(event.event_name, "ViewContent");
    assert.equal(event.event_id, "vc-bf");
    assert.equal(event.event_source_url, "https://www.suprex.dental/?promo=bf");
    assert.equal(user.client_ip_address, "203.0.113.10");
    assert.match(String(user.fbc), /^fb\.1\.\d+\.IwAR123$/);
    assert.equal((event.custom_data as { content_name: string }).content_name, "bf");

    assert.equal(isPromoView("/promo/bf", ""), true);
    const pathPromo = await service.trackViewContent({
      eventId: "vc-path",
      path: "/promo/bf",
      search: "",
    });
    assert.equal(pathPromo.sent, true);
    assert.equal(calls.length, 2);
    assert.equal(bodyOf(calls[1]).data[0].event_id, "vc-path");
  });

  it("makes no HTTP request while the integration is off", async () => {
    const { service, calls } = harness();
    await service.update({ accessToken: TOKEN, enabled: false, testEventCode: "TEST1" });
    await service.trackPurchase({
      orderId: "ord-1",
      value: 10,
      currency: "EUR",
      channel: "website",
      phone: PHONE,
    });
    await service.trackContact({ eventId: "tg-1", label: "bf2026" });
    await service.trackViewContent({ eventId: "vc", path: "/promo/bf", search: "" });
    await service.trackAddToCart({
      eventId: "55555555-5555-5555-5555-555555555555",
      contentId: "SKU-1",
      quantity: 1,
      value: 10,
      currency: "USD",
      channel: "website",
    });
    await service.trackInitiateCheckout({
      eventId: "66666666-6666-6666-6666-666666666666",
      value: 10,
      currency: "USD",
      contentIds: ["SKU-1"],
    });
    await assert.rejects(() => service.sendTestPurchase(), /токен|Увімкніть/);
    assert.equal(calls.length, 0);

    await service.update({ enabled: true, testEventCode: "" });
    await assert.rejects(() => service.sendTestPurchase(), /test event code/);
    assert.equal(calls.length, 0);
  });

  it("stores a Meta failure without the token or the phone", async () => {
    const { service, calls } = harness();
    await enable(service);
    service.fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(
        JSON.stringify({ error: { message: `bad ${TOKEN} phone 380501112233 ip 203.0.113.55` } }),
        { status: 400 },
      );
    }) as typeof fetch;
    await service.trackPurchase({
      orderId: "ord-err",
      value: 20,
      currency: "UAH",
      channel: "website",
      phone: PHONE,
      clientIpAddress: "203.0.113.55",
      clientUserAgent: "Mozilla/5.0",
    });
    const pub = await service.getPublic();
    assert.equal(pub.lastError?.includes(TOKEN), false);
    assert.equal(pub.lastError?.includes("380501112233"), false);
    assert.equal(pub.lastError?.includes(PHONE), false);
    assert.equal(pub.lastError?.includes("203.0.113.55"), false);
    assert.match(pub.lastError ?? "", /bad/);
    assert.equal("accessToken" in pub, false);
    assert.equal(pub.accessTokenMasked.endsWith("7890"), true);
    assert.equal(JSON.stringify(pub).includes(TOKEN), false);

    service.fetchImpl = (async () => {
      throw new Error(`network ${TOKEN} phone 380501112233 ip 198.51.100.20`);
    }) as typeof fetch;
    await service.trackPurchase({
      orderId: "ord-net",
      value: 5,
      currency: "USD",
      channel: "website",
      clientIpAddress: "198.51.100.20",
      phone: PHONE,
    });
    const afterNetwork = await service.getPublic();
    assert.equal(afterNetwork.lastError?.includes(TOKEN), false);
    assert.equal(afterNetwork.lastError?.includes("380501112233"), false);
    assert.equal(afterNetwork.lastError?.includes("198.51.100.20"), false);
    await notifyMetaPurchase(
      {
        trackPurchase: async () => {
          throw new Error(`meta down ${TOKEN}`);
        },
      },
      { orderId: "ord-throw", value: 1, currency: "UAH", channel: "website" },
    );
    await notifyMetaAddToCart(
      {
        trackAddToCart: async () => {
          throw new Error(`meta down ${TOKEN} 203.0.113.10`);
        },
      },
      {
        eventId: "77777777-7777-7777-7777-777777777777",
        contentId: "SKU-1",
        quantity: 1,
        value: 1,
        currency: "USD",
        channel: "website",
      },
    );
  });

  it("sends a test Purchase only when a test event code is saved", async () => {
    const { service, calls } = harness();
    await enable(service, { testEventCode: "TEST123" });
    const result = await service.sendTestPurchase();
    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    const payload = bodyOf(calls[0]);
    assert.equal(payload.test_event_code, "TEST123");
    const event = payload.data[0];
    assert.equal(event.event_name, "Purchase");
    assert.equal((event.custom_data as { content_name: string }).content_name, "Test Purchase");
    assert.equal(result.config.lastEventName, "Purchase");
    assert.ok(result.config.lastSuccessAt);
  });

  it("keeps the default pixel and rejects the unused ones", () => {
    assert.equal(DEFAULT_META_PIXEL_ID, "1262413015423388");
    assert.throws(() => normalizePixelId("1461759528829507"), /не підключаємо/);
    assert.throws(() => normalizePixelId("1486254589075426"), /не підключаємо/);
    assert.deepEqual(Reflect.getMetadata(ROLES_KEY, MetaConversionsController), [UserRole.ADMIN]);
  });
});
