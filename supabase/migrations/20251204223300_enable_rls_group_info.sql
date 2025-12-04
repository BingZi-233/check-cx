-- Enable RLS on group_info
ALTER TABLE public.group_info ENABLE ROW LEVEL SECURITY;

-- Grant table-level access to anon and authenticated roles
GRANT SELECT ON public.group_info TO anon;
GRANT SELECT ON public.group_info TO authenticated;

-- Create policy to allow read access for everyone
CREATE POLICY "Allow public read access" ON public.group_info
FOR SELECT USING (true);

-- Create policy to allow write access for authenticated users (if needed, or specific service role)
-- For now, we might only need read access for the dashboard
-- But if we want to allow inserts via API/dashboard later, we can add this:
-- CREATE POLICY "Allow authenticated insert" ON public.group_info FOR INSERT WITH CHECK (auth.role() = 'authenticated');
-- CREATE POLICY "Allow authenticated update" ON public.group_info FOR UPDATE USING (auth.role() = 'authenticated');

-- Ensure updated_at trigger is set (already in schema.sql but good to verify in migration if needed)
