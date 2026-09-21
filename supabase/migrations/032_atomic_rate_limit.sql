-- 032 — Rate limiter atómico
--
-- QUÉ RESUELVE
-- El limitador anterior (src/lib/rate-limiter.ts) leía el contador, comparaba y
-- escribía en tres sentencias separadas. Con N peticiones concurrentes, todas
-- leían el mismo valor (p. ej. 9), todas pasaban la comprobación y todas
-- escribían 10: el límite de 10/min se podía saltar con ráfagas, y cada
-- petición extra a /process gasta cuota de Groq/Gemini.
--
-- Esta función hace incrementar-y-decidir en UNA sentencia. `INSERT ... ON
-- CONFLICT DO UPDATE` toma un row lock sobre la clave, así que dos llamadas
-- simultáneas se serializan y cada una ve el contador que dejó la anterior.
--
-- SEGURIDAD
-- SECURITY DEFINER + EXECUTE sólo para service_role: la tabla no tiene
-- políticas para usuarios y no debe poder manipularse desde el cliente (un
-- usuario podría resetear su propio contador o vaciar el de otro).
--
-- DESPLIEGUE
-- Aplicar ANTES de desplegar el código nuevo, o el código caerá al camino
-- antiguo (no atómico) hasta que se aplique — ver rate-limiter.ts.

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key text,
  p_max int,
  p_window_ms int
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  INSERT INTO rate_limits AS r (key, count, reset_at)
  VALUES (p_key, 1, now() + make_interval(secs => p_window_ms / 1000.0))
  ON CONFLICT (key) DO UPDATE
    SET count = CASE WHEN r.reset_at <= now() THEN 1 ELSE r.count + 1 END,
        reset_at = CASE
          WHEN r.reset_at <= now() THEN now() + make_interval(secs => p_window_ms / 1000.0)
          ELSE r.reset_at
        END
  RETURNING r.count INTO v_count;

  RETURN v_count <= p_max;
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, int, int) TO service_role;
