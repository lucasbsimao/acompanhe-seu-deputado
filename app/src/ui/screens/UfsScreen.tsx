import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useUfs } from '../hooks/useUfs';

export function UfsScreen() {
  const { ufs, loading, error } = useUfs();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Unidades Federativas</Text>
      {loading && <Text style={styles.subtitle}>Preparando dados locais...</Text>}
      {error && <Text style={styles.error}>Erro: {error}</Text>}
      <FlatList
        data={ufs}
        keyExtractor={(item) => item.uf}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.uf}>{item.uf}</Text>
            <Text style={styles.name}>{item.name}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f6f2ec' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 8, color: '#2b2b2b' },
  subtitle: { color: '#6b6b6b', marginBottom: 12 },
  error: { color: '#b00020', marginBottom: 12 },
  list: { paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ded7ce',
  },
  uf: { width: 48, fontWeight: '700', fontSize: 16, color: '#4a2e1e' },
  name: { fontSize: 16, color: '#2b2b2b' },
});
