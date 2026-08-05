import { z } from "zod";

export const HOUSE_SYSTEMS = ["Placidus", "Whole Sign", "Koch", "Equal"] as const;

export const chartWizardSchema = z
  .object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    gender: z.string().optional(),
    notes: z.string().max(500, "Notes must be under 500 characters").optional(),

    birthDate: z
      .string()
      .min(1, "Birth date is required")
      .refine((value) => !Number.isNaN(Date.parse(value)), "Enter a valid date"),
    birthTime: z.string().optional(),
    unknownTime: z.boolean(),

    birthPlace: z.string().min(2, "Birth place is required"),
    country: z.string().min(1, "Country is required"),
    timezone: z.string().min(1, "Timezone is required"),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    utcOffset: z.string().optional(),

    houseSystem: z.enum(HOUSE_SYSTEMS),
  })
  .superRefine((values, ctx) => {
    if (!values.unknownTime && !values.birthTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["birthTime"],
        message: "Enter the birth time, or mark it as unknown",
      });
    }
  });

export type ChartWizardValues = z.infer<typeof chartWizardSchema>;

export const WIZARD_STEPS = [
  { id: "personal", label: "Personal", fields: ["firstName", "lastName", "gender", "notes"] },
  { id: "date-time", label: "Date & Time", fields: ["birthDate", "birthTime", "unknownTime"] },
  { id: "location", label: "Location", fields: ["birthPlace", "country", "timezone"] },
  { id: "configuration", label: "Configuration", fields: ["houseSystem"] },
] as const;

export type WizardStepId = (typeof WIZARD_STEPS)[number]["id"];
