import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface Props {
  onCompose:     () => void;
  onPerspective: () => void;
}

export default function SecondaryActions({ onCompose, onPerspective }: Props) {
  return (
    <View style={s.row}>
      <TouchableOpacity onPress={onCompose} style={s.btn} activeOpacity={0.7}>
        <Text style={s.btnText}>type a note</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onPerspective} style={s.btn} activeOpacity={0.7}>
        <Text style={s.btnText}>get a perspective</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 8,
    gap: 10,
  },
  btn: {
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(152,212,250,0.20)',
    backgroundColor: 'rgba(152,212,250,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  btnText: {
    fontSize: 13,
    fontFamily: 'GillSans-Light',
    color: 'rgba(224,242,254,0.65)',
  },
});
