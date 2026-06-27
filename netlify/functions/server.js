import { createRequestHandler } from "react-router";

export default async function handler(event, context) {
  const build = await import("../../build/server/index.js");
  const requestHandler = createRequestHandler(build, "production");

  const url = new URL(event.rawUrl);
  const request = new Request(url, {
    method: event.httpMethod,
    headers: event.headers,
    body: event.body && !["GET", "HEAD"].includes(event.httpMethod)
      ? event.isBase64Encoded
        ? Buffer.from(event.body, "base64")
        : event.body
      : undefined,
  });

  const response = await requestHandler(request);

  return {
    statusCode: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: await response.text(),
  };
}