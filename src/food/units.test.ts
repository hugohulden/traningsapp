import { describe, expect, it } from 'vitest';
import { lvToFood, unitFor, unitText, type LvRow } from './engine';
import data from './data/livsmedel.json';

describe('styckvikter', () => {
  it('vanliga styckvaror', () => {
    expect(unitFor('Ägg rått')).toEqual({ unit: 'st', g: 50 });
    expect(unitFor('Ägg kokt eko.')).toEqual({ unit: 'st', g: 50 });
    expect(unitFor('Banan')).toEqual({ unit: 'st', g: 120 });
    expect(unitFor('Äpple m. skal')).toEqual({ unit: 'st', g: 150 });
    expect(unitFor('Tomat körsbärstomat röd')).toEqual({ unit: 'st', g: 15 });
    expect(unitFor('Tomat')).toEqual({ unit: 'st', g: 90 });
    expect(unitFor('Ost hårdost fett 28%')).toEqual({ unit: 'skiva', g: 10 });
    expect(unitFor('Kyckling bröstfilé rå u. skinn')).toEqual({ unit: 'filé', g: 125 });
    expect(unitFor('Mjölk fett 3% berikad')).toEqual({ unit: 'glas', g: 200 });
  });
  it('inte för sådant som inte köps styckvis', () => {
    expect(unitFor('Banan torkad')).toBeNull();
    expect(unitFor('Tomat krossad konserv. m. lag')).toBeNull();
    expect(unitFor('Äpple konserv.')).toBeNull();
    expect(unitFor('Ost halloumi rå fett 22%')).toBeNull();
    expect(unitFor('Lax gravad')).toBeNull();
    expect(unitFor('Äggröra')).toBeNull();
    expect(unitFor('Mjölkchoklad')).toBeNull();
  });
  it('Livsmedelsverkets ägg får 1 st som portion', () => {
    const egg = (data.f as LvRow[]).find((r) => r[1] === 'Ägg rått')!;
    expect(lvToFood(egg)).toMatchObject({ servingG: 50, unitLabel: 'st' });
  });
  it('text', () => {
    expect(unitText(1, 'st')).toBe('1 st');
    expect(unitText(2, 'skiva')).toBe('2 skivor');
    expect(unitText(1.5, 'portion')).toBe('1,5 portioner');
  });
});

describe('bröd', () => {
  it('rätt enhet för olika bröd', () => {
    expect(unitFor('Bröd vitt fibrer ca 5% typ formfranska')).toEqual({ unit: 'skiva', g: 35 });
    expect(unitFor('Bröd vitt vetetortilla')).toEqual({ unit: 'st', g: 40 });
    expect(unitFor('Bröd vitt vete vatten fibrer ca 3,5% typ pitabröd')).toEqual({ unit: 'st', g: 60 });
    expect(unitFor('Bröd vitt typ croissant fransk giffel')).toEqual({ unit: 'st', g: 50 });
    expect(unitFor('Bröd vitt vete fibrer ca 2,5% typ baguette')).toBeNull();
  });
});
