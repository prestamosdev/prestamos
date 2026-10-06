import { useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '../auth/supabase';
import { getDb } from '../db/db';

import { Alert } from 'react-native';

function isUUID(str: string) {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(str);
}

async function pushChanges(lenderId: string) {
  if (!supabase || !isUUID(lenderId)) return;
  const db = await getDb(lenderId);
  
  // Tablas a sincronizar
  const tables = ['clients', 'loans', 'payments', 'payment_audit'];
  
  for (const table of tables) {
    const records = await db.getAllAsync(`SELECT * FROM ${table} WHERE synced = 0`);
    if (records.length === 0) continue;

    // Supabase upsert requires removing the 'synced' column
    const toUpsert = records.map((r: any) => {
      const { synced, document, ...rest } = r;
      // Mapear document a document_id para la nube
      return table === 'clients' ? { ...rest, document_id: document } : rest;
    });

    const { error } = await supabase.from(table).upsert(toUpsert);
    if (!error) {
      const ids = records.map((r: any) => `'${r.id}'`).join(',');
      await db.runAsync(`UPDATE ${table} SET synced = 1 WHERE id IN (${ids})`);
    } else {
      console.error(`Error pushing ${table}:`, error.message);
      Alert.alert('Error de Sincronización', `No se pudo subir a Supabase (${table}): ${error.message}`);
    }
  }
}

async function pullChanges(lenderId: string) {
  if (!supabase || !isUUID(lenderId)) return;
  const db = await getDb(lenderId);
  const tables = ['clients', 'loans', 'payments', 'payment_audit'];

  for (const table of tables) {
    // Buscar la fecha de actualización más reciente local
    let max_updated = '1970-01-01T00:00:00.000Z';
    try {
      const res = await db.getFirstAsync<{ max_updated: string }>(`SELECT MAX(created_at) as max_updated FROM ${table}`);
      if (res?.max_updated) max_updated = res.max_updated;
    } catch (e) {
      // Ignorar si falla por columnas inexistentes
    }

    const { data, error } = await supabase
      .from(table)
      .select('*')
      .gt('created_at', max_updated);

    if (error) {
      console.error(`Error pulling ${table}:`, error.message);
      continue;
    }

    if (data && data.length > 0) {
      for (const row of data) {
        // Mapear document_id a document al recibir de la nube
        if (table === 'clients' && row.document_id) {
          row.document = row.document_id;
          delete row.document_id;
        }
        
        const cols = Object.keys(row).join(',');
        const placeholders = Object.keys(row).map(() => '?').join(',');
        const values = Object.values(row);
        
        await db.runAsync(
          `INSERT OR REPLACE INTO ${table} (${cols}, synced) VALUES (${placeholders}, 1)`,
          values
        );
      }
    }
  }
}

export async function syncDatabase(lenderId: string) {
  if (!supabase) return;
  const state = await NetInfo.fetch();
  if (!state.isConnected) return;

  try {
    // 1. Enviar cambios locales no sincronizados a Supabase
    await pushChanges(lenderId);
    // 2. Traer cambios más recientes de Supabase a la base local
    await pullChanges(lenderId);
  } catch (e) {
    console.error('Error durante la sincronización:', e);
  }
}

// Hook para ejecutar la sincronización automáticamente
export function useAutoSync(lenderId?: string) {
  useEffect(() => {
    if (!lenderId) return;
    
    // Sincronizar al inicio
    syncDatabase(lenderId);

    // Sincronizar cada vez que vuelva la conexión
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected) {
        syncDatabase(lenderId);
      }
    });

    return () => unsubscribe();
  }, [lenderId]);
}
