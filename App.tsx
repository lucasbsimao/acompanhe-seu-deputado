import React, { useEffect, useState } from 'react';
import { Text, View, StyleSheet, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getLocalApiBase } from './ServiceDiscovery';


export default function App() {
  const [json, setJson] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);


  useEffect(() => {
    (async () => {
      try {
        const base = await getLocalApiBase();
        const r = await fetch(`${base}/person`);
        setJson(await r.json());
      } catch (e: any) {
        setError(String(e?.message ?? e));
      }
    })();
  }, []);


  return (
    <SafeAreaProvider style={styles.container}>
      <Text style={styles.title}>React Native + Go (local)</Text>
      {error && <Text style={styles.error}>Error: {error}</Text>}
      <View style={styles.card}>
        <Text style={styles.mono}>{JSON.stringify(json, null, 2)}</Text>
      </View>
    </SafeAreaProvider>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 12 },
  error: { color: 'red', marginBottom: 12 },
  card: { width: '90%', borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  mono: { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }), fontSize: 14 },
});