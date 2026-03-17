import { admin, adminDb } from "@/lib/server/firebaseAdmin";

type AnyObj = Record<string, any>;
const COLLECTION = "travelPartnerRequests";

const createTravelRequestData = (data: AnyObj): AnyObj => ({
  requester: data.requester || null,
  destination: {
    country: data.destination?.country || "",
    city: data.destination?.city || "",
    region: data.destination?.region || "",
    coordinates: data.destination?.coordinates || null,
  },
  startDate: data.startDate || null,
  endDate: data.endDate || null,
  budget: {
    min: typeof data.budget?.min === "number" ? data.budget.min : 0,
    max: typeof data.budget?.max === "number" ? data.budget.max : 0,
    currency: data.budget?.currency || "USD",
    isFlexible: typeof data.budget?.isFlexible === "boolean" ? data.budget.isFlexible : true,
  },
  groupSize: {
    preferred: typeof data.groupSize?.preferred === "number" ? data.groupSize.preferred : 2,
    maximum: typeof data.groupSize?.maximum === "number" ? data.groupSize.maximum : 4,
  },
  travelStyle: data.travelStyle || "budget",
  accommodation: Array.isArray(data.accommodation) ? data.accommodation : ["hotel", "airbnb"],
  transportation: Array.isArray(data.transportation) ? data.transportation : ["flight", "local_transport"],
  interests: Array.isArray(data.interests) ? data.interests : [],
  title: (data.title || "").slice(0, 100),
  description: (data.description || "").slice(0, 1000),
  partnerRequirements: {
    ageRange: {
      min: typeof data.partnerRequirements?.ageRange?.min === "number" ? data.partnerRequirements.ageRange.min : 18,
      max: typeof data.partnerRequirements?.ageRange?.max === "number" ? data.partnerRequirements.ageRange.max : 100,
    },
    gender: data.partnerRequirements?.gender || "any",
    languages: Array.isArray(data.partnerRequirements?.languages) ? data.partnerRequirements.languages : [],
    experience: data.partnerRequirements?.experience || "any",
  },
  status: data.status || "active",
  responses: Array.isArray(data.responses) ? data.responses : [],
  matchedPartners: Array.isArray(data.matchedPartners) ? data.matchedPartners : [],
  isPublic: typeof data.isPublic === "boolean" ? data.isPublic : true,
  allowDirectContact: typeof data.allowDirectContact === "boolean" ? data.allowDirectContact : true,
  expiresAt: data.expiresAt || null,
  views: typeof data.views === "number" ? data.views : 0,
  responseCount: typeof data.responseCount === "number" ? data.responseCount : 0,
  createdAt: data.createdAt || admin.firestore.FieldValue.serverTimestamp(),
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
});

class TravelPartnerRequestService {
  private collection = adminDb.collection(COLLECTION);

  async create(data: AnyObj) {
    const ref = this.collection.doc();
    const payload = createTravelRequestData(data);
    await ref.set(payload);
    return { id: ref.id, ...payload };
  }

  async findById(id: string) {
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  }

  async update(id: string, updates: AnyObj) {
    await this.collection.doc(id).update({ ...updates, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return this.findById(id);
  }

  async addResponse(requestId: string, userId: string, message: string) {
    const ref = this.collection.doc(requestId);
    const doc = await ref.get();
    if (!doc.exists) throw new Error("Request not found");

    const data = doc.data() as AnyObj;
    const responses = data.responses || [];
    if (responses.find((response: AnyObj) => response.user === userId)) {
      throw new Error("User has already responded to this request");
    }

    responses.push({ user: userId, message, status: "pending", respondedAt: Date.now() });
    await ref.update({
      responses,
      responseCount: responses.length,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return this.findById(requestId);
  }

  async incrementViews(requestId: string) {
    await this.collection.doc(requestId).update({
      views: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  isExpired(request: AnyObj) {
    const now = Date.now();
    const expiresAt = request.expiresAt ? new Date(request.expiresAt).getTime() : 0;
    const startDate = request.startDate ? new Date(request.startDate).getTime() : 0;
    return (expiresAt && expiresAt < now) || (startDate && startDate < now);
  }
}

export const travelPartnerRequestService = new TravelPartnerRequestService();
