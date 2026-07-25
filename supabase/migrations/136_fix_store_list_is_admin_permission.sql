-- Em Estoque (list_store_products) fails for anon/authenticated after 135 joined
-- product_spec_templates under RLS that only allows admins via is_admin().
-- Hardening in 111 revoked EXECUTE on is_admin from PUBLIC, so policy evaluation
-- raises "permission denied for function is_admin" instead of returning false.

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

DROP POLICY IF EXISTS "Public can read product spec templates"
  ON public.product_spec_templates;

CREATE POLICY "Public can read product spec templates"
  ON public.product_spec_templates
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins can manage product spec templates"
  ON public.product_spec_templates;

CREATE POLICY "Admins can insert product spec templates"
  ON public.product_spec_templates
  FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update product spec templates"
  ON public.product_spec_templates
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete product spec templates"
  ON public.product_spec_templates
  FOR DELETE
  USING (public.is_admin());
