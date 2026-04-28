-- Create areas through a server-side function so the database, not the client,
-- owns the authenticated creator id.

CREATE OR REPLACE FUNCTION create_area(p_name text, p_color text DEFAULT '#6B7280')
RETURNS areas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_area areas;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO areas (name, color, user_id)
  VALUES (trim(p_name), p_color, auth.uid())
  RETURNING * INTO v_area;

  RETURN v_area;
END;
$$;
