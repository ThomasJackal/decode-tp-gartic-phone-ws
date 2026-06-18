import { z } from "zod";

export const UsernameSchema = z
    .string()
    .min(1, "Username required")
    .max(20, "Max 20 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "Only letters, numbers, hyphen and underscore");

export const WordSchema = z
    .string()
    .min(1, "Word required")
    .max(50, "Max 50 characters");

export const RoomCodeSchema = z
    .string()
    .length(6, "Room code must be 6 characters")
    .regex(/^[A-Z0-9]+$/, "Invalid room code format");

export const DrawingEventSchema = z.object({
    type: z.literal("drawing"),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Invalid hex color"),
    thickness: z.number().int().min(1).max(50),
    fromX: z.number().finite(),
    fromY: z.number().finite(),
    toX: z.number().finite(),
    toY: z.number().finite(),
});

export const SettingsSchema = z.object({
    drawDuration: z.number().int().min(30000).max(300000).optional(),
    namingDuration: z.number().int().min(10000).max(120000).optional(),
}).refine(obj => obj.drawDuration !== undefined || obj.namingDuration !== undefined, {
    message: "At least one setting must be provided",
});

export const NamingEventSchema = z.object({
    type: z.literal("naming"),
    name: z.string().min(1).max(100),
});

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): { ok: true; data: T } | { ok: false; error: string } {
    const result = schema.safeParse(data);
    if (result.success) {
        return { ok: true, data: result.data };
    }
    const issue = result.error.issues[0];
    return { ok: false, error: issue?.message ?? "Invalid input" };
}
