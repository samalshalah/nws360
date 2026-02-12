import { createHmac } from "crypto";
import { storage } from "./storage";
import type { IntegrationWebhook } from "@shared/schema";

export async function deliverWebhookEvent(webhook: IntegrationWebhook, eventType: string, payload: any) {
  const body = JSON.stringify({
    event: eventType,
    timestamp: new Date().toISOString(),
    data: payload,
  });

  const signature = createHmac("sha256", webhook.secret).update(body).digest("hex");

  const delivery = await storage.createWebhookDelivery({
    webhookId: webhook.id,
    eventType,
    payload,
    attempts: 1,
    success: false,
  });

  try {
    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-NWS360-Signature": `sha256=${signature}`,
        "X-NWS360-Event": eventType,
        "X-NWS360-Delivery": String(delivery.id),
      },
      body,
      signal: AbortSignal.timeout(10000),
    });

    const responseBody = await response.text().catch(() => "");
    await storage.updateWebhookDelivery(delivery.id, {
      statusCode: response.status,
      responseBody: responseBody.slice(0, 1000),
      success: response.ok,
      lastAttemptAt: new Date(),
    });

    if (!response.ok) {
      console.log(`[Webhook] Delivery ${delivery.id} failed: ${response.status} for ${webhook.url}`);
    }
  } catch (error: any) {
    await storage.updateWebhookDelivery(delivery.id, {
      statusCode: 0,
      responseBody: error.message?.slice(0, 500) || "Connection failed",
      success: false,
      lastAttemptAt: new Date(),
    });
    console.log(`[Webhook] Delivery ${delivery.id} error: ${error.message} for ${webhook.url}`);
  }
}

export async function dispatchEvent(eventType: string, payload: any) {
  const webhooks = await storage.getWebhooksByEvent(eventType);
  if (webhooks.length === 0) return;

  console.log(`[Webhook] Dispatching "${eventType}" to ${webhooks.length} webhook(s)`);
  for (const webhook of webhooks) {
    try {
      await deliverWebhookEvent(webhook, eventType, payload);
    } catch (err) {
      console.error(`[Webhook] Failed to deliver to webhook ${webhook.id}:`, err);
    }
  }
}
