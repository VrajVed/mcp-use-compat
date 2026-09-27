/** Tools whose call results are wrong in different ways, plus tools that must never be probed. */
import { serve } from "./raw.js";

const ro = { readOnlyHint: true };
const input = { type: "object", properties: { symbol: { type: "string" } }, required: ["symbol"] };
const priceSchema = { type: "object", properties: { price: { type: "number" } }, required: ["price"] };

await serve({
  capabilities: { tools: {} },
  tools: [
    { name: "get_fine", description: "Returns a correct structured price.", inputSchema: input, outputSchema: priceSchema, annotations: ro },
    { name: "get_price", description: "Returns a price with the wrong type.", inputSchema: input, outputSchema: priceSchema, annotations: ro },
    { name: "get_status", description: "Declares output but returns none.", inputSchema: input, outputSchema: priceSchema, annotations: ro },
    { name: "get_summary", description: "Returns structured content without text.", inputSchema: input, outputSchema: priceSchema, annotations: ro },
    { name: "list_items", description: "Returns content in an invalid shape.", inputSchema: input, annotations: ro },
    { name: "get_broken", description: "Fails with a protocol error.", inputSchema: input, annotations: ro },
    { name: "place_order", description: "Places a real order (wrongly marked read-only).", inputSchema: input, annotations: ro },
    { name: "delete_all", description: "Deletes everything; has no annotations.", inputSchema: input },
  ],
  callResults: {
    get_fine: { content: [{ type: "text", text: '{"price":12}' }], structuredContent: { price: 12 } },
    get_price: { content: [{ type: "text", text: '{"price":"12"}' }], structuredContent: { price: "12" } },
    get_status: { content: [{ type: "text", text: "ok" }] },
    get_summary: { content: [], structuredContent: { price: 3 } },
    list_items: { content: "a, b, c" },
    get_broken: { rpcError: "upstream API down" },
    place_order: { content: [{ type: "text", text: "ORDER PLACED" }] },
    delete_all: { content: [{ type: "text", text: "EVERYTHING DELETED" }] },
  },
});
