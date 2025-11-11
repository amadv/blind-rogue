import { StyleSheet } from 'react-native';

import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Collapsible } from '@/components/ui/collapsible';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Fonts } from '@/constants/theme';

export default function TabTwoScreen() {
  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#D0D0D0', dark: '#353636' }}
      headerImage={
        <IconSymbol
          size={310}
          color="#808080"
          name="chevron.left.forwardslash.chevron.right"
          style={styles.headerImage}
        />
      }>
      <ThemedView style={styles.titleContainer}>
        <ThemedText
          type="title"
          style={{
            fontFamily: Fonts.rounded,
          }}>
          Blind Rogue Settings                                                                
        </ThemedText>
      </ThemedView>
      <ThemedText>This app includes example code to help you get started.</ThemedText>
      <Collapsible title="Game Controls">
        <Collapsible title="Hear (one finger swipe):">
        <ThemedText>
          • Swipe in any direction (up, down, left, right) with one finger to "listen" and get an audio cue for the space in that direction.
        </ThemedText>
        </Collapsible>
        <ThemedText></ThemedText>
        <Collapsible title="Move (two fingers swipe):">
        <ThemedText>
          • Swipe in any direction with two fingers to move your player in that direction.
          • If you move into a wall or off the grid, you'll "die" and be restarted on the same level after a sound cue.
        </ThemedText>
        </Collapsible>
        <ThemedText></ThemedText>
        <Collapsible title="Reset Level (new maze):">
        <ThemedText>
          • If you win or die, a new maze is generated.
        </ThemedText>
        </Collapsible>
        <ThemedText></ThemedText>
        {'\n'}
      </Collapsible>
      <Collapsible title="Tips">
        <ThemedText>
          • Use "hear" in each direction to find the safe path.
          {'\n\n'}
          • Try not to move unless you're sure—moving into walls or off the maze restarts your position!
        </ThemedText>
      </Collapsible>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  headerImage: {
    color: '#808080',
    bottom: -90,
    left: -35,
    position: 'absolute',
  },
  titleContainer: {
    flexDirection: 'row',
    gap: 8,
  },
});
