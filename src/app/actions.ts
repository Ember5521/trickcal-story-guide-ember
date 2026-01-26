"use server";

export async function verifyAdminPassword(password: string): Promise<boolean> {
    // We use a non-NEXT_PUBLIC env variable so it remains strictly on the server
    const secretKey = process.env.ADMIN_KEY || "ember5521";
    return password === secretKey;
}
