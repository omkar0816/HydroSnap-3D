import { describe, expect, it } from "vitest"
import {
  fieldErrors,
  loginSchema,
  officerSignUpSchema,
  officerToUser,
} from "@/services/authService"

const validSignUp = {
  name: "  Asha   Patil ",
  department: "Soil  Conservation",
  email: "  Asha@Example.GOV.in ",
  state: "Maharashtra",
  district: "Pune",
  locationOperatingOn: "Khadakwasla cluster",
  password: "field2026",
  confirmPassword: "field2026",
}

describe("officer sign-up validation", () => {
  it("normalizes profile details and email", () => {
    const parsed = officerSignUpSchema.parse(validSignUp)
    expect(parsed.name).toBe("Asha Patil")
    expect(parsed.department).toBe("Soil Conservation")
    expect(parsed.email).toBe("asha@example.gov.in")
  })

  it("accepts names written in Devanagari", () => {
    expect(
      officerSignUpSchema.safeParse({
        ...validSignUp,
        name: "आशा पाटील",
      }).success,
    ).toBe(true)
  })

  it("rejects invalid details and weak passwords", () => {
    const result = officerSignUpSchema.safeParse({
      ...validSignUp,
      email: "not-an-email",
      state: "Atlantis",
      district: " ",
      password: "short",
      confirmPassword: "short",
    })
    expect(result.success).toBe(false)
    if (result.success) return
    const errors = fieldErrors(result.error)
    expect(errors.email).toBeTruthy()
    expect(errors.state).toBeTruthy()
    expect(errors.district).toBeTruthy()
    expect(errors.password).toBeTruthy()
  })

  it("reports a mismatched confirmation password", () => {
    const result = officerSignUpSchema.safeParse({
      ...validSignUp,
      confirmPassword: "field2027",
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(fieldErrors(result.error).confirmPassword).toBe(
        "Passwords do not match.",
      )
    }
  })
})

describe("login validation", () => {
  it("requires a valid email and non-empty password", () => {
    expect(loginSchema.safeParse({ email: "", password: "" }).success).toBe(
      false,
    )
    expect(
      loginSchema.safeParse({
        email: "officer@example.gov.in",
        password: "password",
      }).success,
    ).toBe(true)
  })
})

describe("officerToUser", () => {
  it("converts an officer profile to a dashboard identity", () => {
    expect(
      officerToUser({
        id: "user-1",
        officerCode: "OFF-1001",
        name: "Asha Patil",
        email: "asha@example.gov.in",
        department: "Soil Conservation",
        locationOperatingOn: "Haveli",
        state: "Maharashtra",
        district: "Pune",
        status: "active",
      }),
    ).toMatchObject({
      id: "user-1",
      name: "Asha Patil",
      role: "Field Officer",
      initials: "AP",
    })
  })
})
