# Supabase Storage Setup

## Create Storage Buckets

In your Supabase Dashboard, go to Storage and create the following buckets:

### 1. `avatars` Bucket
- **Public**: Yes (so avatars can be accessed via URL)
- **File size limit**: 5MB
- **Allowed MIME types**: image/*

### 2. `vocals` Bucket (if not already created)
- **Public**: No (private)
- **File size limit**: As needed

### 3. `thumbnails` Bucket (if not already created)
- **Public**: Yes
- **File size limit**: As needed

## Storage Policies

For the `avatars` bucket, add the following policies:

### Policy: Users can upload their own avatars
```sql
CREATE POLICY "Users can upload own avatars"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
```

### Policy: Users can update their own avatars
```sql
CREATE POLICY "Users can update own avatars"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
```

### Policy: Public can read avatars
```sql
CREATE POLICY "Public can read avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');
```

