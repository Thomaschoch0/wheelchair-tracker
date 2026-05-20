import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/sensor-reading",
  method: "POST",

  handler: httpAction(async (ctx, request) => {

    const body = await request.json();

    await ctx.runMutation(api.sensorReadings.insertReading, {
      deviceId: body.deviceId ?? "wheelchair_001",

      leftForceRaw: body.leftForceRaw,
      rightForceRaw: body.rightForceRaw,

      source: body.source ?? "main_controller",

      timestamp: body.timestamp ?? Date.now(),
    });

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }),
});

export default http;