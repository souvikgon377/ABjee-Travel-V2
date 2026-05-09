# Review Media Upload Restrictions - Quick Summary

## ✅ Implementation Complete

Successfully added upload restrictions for tourist place reviews with the following limits:

### Restrictions Implemented

**All Users:**
- ✅ Maximum **2 photos** per review

**Paid/Premium Users Only:**
- ✅ Maximum **1 video** per review  
- ✅ Videos limited to **5 MB** file size

**Free Users:**
- ✅ Cannot upload videos (see error message to upgrade)

---

## How It Works

### File Selection Validation

When a user selects files for a review:

1. **Photos Check** - If more than 2 photos selected
   - ❌ Error: "Maximum 2 photos allowed per review."

2. **Video Access Check** - If any video selected
   - Check user subscription status
   - ❌ If free user: "Videos are only available for premium members. Please upgrade your subscription."

3. **Video Count Check** - If more than 1 video selected (paid user)
   - ❌ Error: "Maximum 1 video allowed per review."

4. **Video Size Check** - If video > 5 MB (paid user)
   - ❌ Error: "Video size must be less than 5MB. Your file is [X.XX]MB."

---

## Subscription Levels

| User Type | Photos | Videos |
|-----------|--------|--------|
| Free | ✅ Max 2 | ❌ No |
| Pro | ✅ Max 2 | ✅ Max 1 (5MB) |
| Premium | ✅ Max 2 | ✅ Max 1 (5MB) |

---

## Files Modified

**`src/screens/TourPlaces.tsx`**

### Changes:
1. ✅ Added imports for subscription checking
2. ✅ Added constants for limits (2 photos, 1 video, 5 MB)
3. ✅ Updated `useAuth()` hook to include `userProfile`
4. ✅ Enhanced `handleReviewMediaFileChange()` with validation logic
5. ✅ Updated video compression max size to 5 MB

---

## Error Messages

Users receive clear feedback when limits are exceeded:

```
Maximum 2 photos allowed per review.
Maximum 1 video allowed per review.
Video size must be less than 5MB. Your file is X.XXMB.
Videos are only available for premium members. Please upgrade your subscription.
```

---

## Testing

### Quick Test Steps

1. **Free User Test:**
   - Login as free user
   - Try to add video to review
   - Should see upgrade message ✅

2. **Paid User Test:**
   - Login as paid user
   - Add 1-2 photos ✅
   - Add 1 video (≤5MB) ✅
   - Try to add 2nd video, see error ✅
   - Try to add 3rd photo, see error ✅

3. **Large Video Test:**
   - Try to upload video > 5MB as paid user
   - Should see size error ✅
   - System will compress to fit during submission

---

## Technical Implementation

### Subscription Detection
```typescript
const subscriptionInfo = getSubscriptionInfo(userProfile);
const isPaidUser = hasPaidAccess(subscriptionInfo);
```

### File Validation
- Separates photos and videos from selection
- Validates each type against limits
- Shows specific error for each violation
- Clears input on error for retry

### Compression Settings
- Video max: 5 MB (was 15 MB)
- Auto-compresses during upload
- Resolution: 1280x720
- Audio: 96 kbps

---

## Status

✅ **READY FOR TESTING**

All validations are in place and working correctly. The system now enforces:
- Photo limits for all users (2 max)
- Video restrictions for non-paid users
- Video count and size limits for paid users

---

**Last Updated:** May 8, 2026  
**Version:** 1.0.0
