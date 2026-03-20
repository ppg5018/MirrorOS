import { useState, useEffect } from 'react';
import { Play, Pause, SkipForward, Flame, Clock, Dumbbell, TrendingUp, Zap, Target } from 'lucide-react';

interface Exercise {
  id: number;
  name: string;
  sets: number;
  reps: string;
  restTime: number;
  image: string;
  instructions: string[];
  muscles: string[];
  formTip: string;
}

const workoutData: Exercise[] = [
  {
    id: 1,
    name: 'Barbell Back Squat',
    sets: 4,
    reps: '8-10',
    restTime: 120,
    image: 'https://images.unsplash.com/photo-1770026136877-8ddf98cd6500?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxiYXJiZWxsJTIwc3F1YXQlMjBneW0lMjBleGVyY2lzZXxlbnwxfHx8fDE3NzM5OTEzNTB8MA&ixlib=rb-4.1.0&q=80&w=1080',
    instructions: [
      'Stand with feet shoulder-width apart, barbell on upper back',
      'Keep chest up, core tight, eyes forward throughout movement',
      'Lower by pushing hips back and bending knees simultaneously',
      'Descend until thighs are parallel to ground or lower',
      'Drive through heels to return to starting position'
    ],
    muscles: ['Quads', 'Glutes', 'Core', 'Hamstrings'],
    formTip: 'Keep your knees tracking over your toes. Don\'t let them cave inward.'
  },
  {
    id: 2,
    name: 'Romanian Deadlift',
    sets: 3,
    reps: '10-12',
    restTime: 90,
    image: 'https://images.unsplash.com/photo-1558611848-73f7eb4001a1?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkZWFkbGlmdCUyMGd5bSUyMGV4ZXJjaXNlfGVufDF8fHx8MTc3Mzk5MTM1MHww&ixlib=rb-4.1.0&q=80&w=1080',
    instructions: [
      'Hold barbell at hip level with overhand grip',
      'Keep slight bend in knees, shoulders back',
      'Hinge at hips, pushing them back while lowering bar',
      'Lower until you feel stretch in hamstrings',
      'Drive hips forward to return to start'
    ],
    muscles: ['Hamstrings', 'Glutes', 'Lower Back'],
    formTip: 'Maintain a neutral spine. The bar should travel close to your legs.'
  },
  {
    id: 3,
    name: 'Overhead Press',
    sets: 4,
    reps: '6-8',
    restTime: 120,
    image: 'https://images.unsplash.com/photo-1772450014048-ec6dc611be2b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxvdmVyaGVhZCUyMHByZXNzJTIwZ3ltfGVufDF8fHx8MTc3Mzk5MTM1MHww&ixlib=rb-4.1.0&q=80&w=1080',
    instructions: [
      'Stand with feet hip-width, bar at shoulder height',
      'Grip bar just outside shoulders, elbows slightly forward',
      'Brace core and press bar straight overhead',
      'Lock out arms at top, bar over mid-foot',
      'Lower with control back to shoulders'
    ],
    muscles: ['Shoulders', 'Triceps', 'Upper Chest', 'Core'],
    formTip: 'Press the bar in a straight line. Move your head back slightly to avoid hitting it.'
  },
  {
    id: 4,
    name: 'Weighted Pull-Ups',
    sets: 3,
    reps: '6-8',
    restTime: 150,
    image: 'https://images.unsplash.com/photo-1558611848-73f7eb4001a1?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkZWFkbGlmdCUyMGd5bSUyMGV4ZXJjaXNlfGVufDF8fHx8MTc3Mzk5MTM1MHww&ixlib=rb-4.1.0&q=80&w=1080',
    instructions: [
      'Hang from bar with palms facing away, shoulder-width grip',
      'Engage lats and pull shoulder blades down and back',
      'Pull body up until chin clears the bar',
      'Hold briefly at top position',
      'Lower with control to full hang'
    ],
    muscles: ['Lats', 'Biceps', 'Upper Back'],
    formTip: 'Avoid swinging. Control the movement both up and down.'
  },
  {
    id: 5,
    name: 'Dumbbell Lunges',
    sets: 3,
    reps: '10 each',
    restTime: 90,
    image: 'https://images.unsplash.com/photo-1770026136877-8ddf98cd6500?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxiYXJiZWxsJTIwc3F1YXQlMjBneW0lMjBleGVyY2lzZXxlbnwxfHx8fDE3NzM5OTEzNTB8MA&ixlib=rb-4.1.0&q=80&w=1080',
    instructions: [
      'Hold dumbbells at sides, stand tall',
      'Step forward with one leg, lowering hips',
      'Drop back knee toward floor, front thigh parallel',
      'Push through front heel to return to start',
      'Alternate legs for each rep'
    ],
    muscles: ['Quads', 'Glutes', 'Hamstrings'],
    formTip: 'Keep your torso upright. Don\'t let your front knee go past your toes.'
  }
];

function App() {
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [currentSet, setCurrentSet] = useState(1);
  const [timer, setTimer] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [totalCalories, setTotalCalories] = useState(284);
  const [elapsedTime, setElapsedTime] = useState(1845); // in seconds
  
  const currentExercise = workoutData[currentExerciseIndex];
  
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isPaused) {
        setTimer(prev => prev + 1);
        setElapsedTime(prev => prev + 1);
        // Simulate calorie burn (roughly 5 calories per minute)
        if (timer % 12 === 0) {
          setTotalCalories(prev => prev + 1);
        }
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [isPaused, timer]);
  
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  const formatElapsedTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  };
  
  const handleNext = () => {
    if (currentSet < currentExercise.sets) {
      setCurrentSet(prev => prev + 1);
      setTimer(0);
    } else if (currentExerciseIndex < workoutData.length - 1) {
      setCurrentExerciseIndex(prev => prev + 1);
      setCurrentSet(1);
      setTimer(0);
    }
  };
  
  const handleSkip = () => {
    if (currentExerciseIndex < workoutData.length - 1) {
      setCurrentExerciseIndex(prev => prev + 1);
      setCurrentSet(1);
      setTimer(0);
    }
  };
  
  const handleNextExercise = () => {
    if (currentExerciseIndex < workoutData.length - 1) {
      setCurrentExerciseIndex(prev => prev + 1);
      setCurrentSet(1);
      setTimer(0);
    }
  };
  
  const progressPercentage = ((currentExerciseIndex) / workoutData.length) * 100;
  
  return (
    <div className="w-screen h-screen bg-black flex items-center justify-center overflow-hidden">
      <div className="bg-black text-white flex flex-col overflow-hidden" style={{ width: '1920px', height: '1080px', fontFamily: 'Inter, sans-serif' }}>
      {/* Top Bar */}
      <div className="h-20 flex-shrink-0 border-b border-[#2a2a2a] flex items-center justify-between px-8">
        <div className="flex items-center gap-3">
          {workoutData.map((_, index) => (
            <div 
              key={index}
              className={`w-3 h-3 rounded-full ${
                index === currentExerciseIndex 
                  ? 'bg-[#FF3C00]' 
                  : index < currentExerciseIndex 
                    ? 'bg-[#5EE8C0]' 
                    : 'bg-[#3a3a3a]'
              }`}
            />
          ))}
        </div>
        
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-[#5EE8C0]" />
            <span className="text-xl" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              {formatElapsedTime(elapsedTime)}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Flame className="w-5 h-5 text-[#FF3C00]" />
            <span className="text-xl" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              {totalCalories} cal
            </span>
          </div>
        </div>
      </div>
      
      {/* Main Content - 3 Columns */}
      <div className="flex-1 grid grid-cols-3 gap-0 overflow-hidden">
        {/* Left Column */}
        <div className="border-r border-[#2a2a2a] p-8 flex flex-col overflow-hidden">
          <div className="mb-8">
            <h1 className="text-3xl mb-2" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              {currentExercise.name}
            </h1>
            <p className="text-[#999999]">
              {currentExercise.sets} sets × {currentExercise.reps} reps
            </p>
          </div>
          
          <div className="mb-8">
            <div className="text-sm text-[#999999] mb-2">CURRENT SET</div>
            <div className="text-6xl" style={{ fontFamily: 'Space Grotesk, sans-serif', color: '#5EE8C0' }}>
              {currentSet}/{currentExercise.sets}
            </div>
          </div>
          
          <div className="mb-8">
            <div className="text-sm text-[#999999] mb-2">REST TIMER</div>
            <div className="text-8xl" style={{ fontFamily: 'Space Grotesk, sans-serif', color: '#FF3C00' }}>
              {formatTime(timer)}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-[#1a1a1a] p-4 rounded-lg border border-[#2a2a2a]">
              <div className="flex items-center gap-2 mb-2">
                <Dumbbell className="w-4 h-4 text-[#5EE8C0]" />
                <span className="text-xs text-[#999999]">WEIGHT</span>
              </div>
              <div className="text-2xl" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>225 lb</div>
            </div>
            
            <div className="bg-[#1a1a1a] p-4 rounded-lg border border-[#2a2a2a]">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-[#5EE8C0]" />
                <span className="text-xs text-[#999999]">VOLUME</span>
              </div>
              <div className="text-2xl" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>7,200 lb</div>
            </div>
            
            <div className="bg-[#1a1a1a] p-4 rounded-lg border border-[#2a2a2a]">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-[#5EE8C0]" />
                <span className="text-xs text-[#999999]">TEMPO</span>
              </div>
              <div className="text-2xl" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>3-0-1-0</div>
            </div>
            
            <div className="bg-[#1a1a1a] p-4 rounded-lg border border-[#2a2a2a]">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-[#5EE8C0]" />
                <span className="text-xs text-[#999999]">REST</span>
              </div>
              <div className="text-2xl" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{currentExercise.restTime}s</div>
            </div>
          </div>
          
          <div className="mt-auto bg-[#1a1a1a] p-6 rounded-lg border border-[#5EE8C0]">
            <div className="text-xs text-[#5EE8C0] mb-2" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              FORM TIP
            </div>
            <p className="text-sm text-white">
              {currentExercise.formTip}
            </p>
          </div>
        </div>
        
        {/* Middle Column */}
        <div className="border-r border-[#2a2a2a] p-8 flex flex-col overflow-hidden">
          <div className="relative mb-6 rounded-lg overflow-hidden flex-shrink-0" style={{ height: '340px' }}>
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black z-10" style={{ opacity: 0.7 }}></div>
            <img 
              src={currentExercise.image} 
              alt={currentExercise.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute top-4 right-4 z-20 bg-[#FF3C00] px-4 py-2 rounded-full">
              <span style={{ fontFamily: 'Space Grotesk, sans-serif' }}>ACTIVE</span>
            </div>
          </div>
          
          <div className="mb-6 flex-1 overflow-hidden">
            <h3 className="text-sm text-[#999999] mb-4" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              STEP-BY-STEP INSTRUCTIONS
            </h3>
            <div className="space-y-3">
              {currentExercise.instructions.map((instruction, index) => (
                <div key={index} className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#5EE8C0] text-black flex items-center justify-center" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                    {index + 1}
                  </div>
                  <p className="text-sm text-[#cccccc] flex-1 pt-1">
                    {instruction}
                  </p>
                </div>
              ))}
            </div>
          </div>
          
          <div className="flex-shrink-0">
            <div className="text-xs text-[#999999] mb-3" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              TARGET MUSCLES
            </div>
            <div className="flex flex-wrap gap-2">
              {currentExercise.muscles.map((muscle, index) => (
                <div 
                  key={index}
                  className="px-4 py-2 bg-[#1a1a1a] border border-[#5EE8C0] rounded-full text-sm"
                  style={{ fontFamily: 'Space Grotesk, sans-serif', color: '#5EE8C0' }}
                >
                  {muscle}
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* Right Column */}
        <div className="p-8 flex flex-col overflow-hidden">
          <div className="bg-[#1a1a1a] p-6 rounded-lg border border-[#2a2a2a] mb-6">
            <div className="text-sm text-[#999999] mb-2">CALORIES BURNED</div>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl" style={{ fontFamily: 'Space Grotesk, sans-serif', color: '#FF3C00' }}>
                {totalCalories}
              </span>
              <span className="text-xl text-[#999999]">kcal</span>
            </div>
            <div className="mt-4 h-2 bg-[#2a2a2a] rounded-full overflow-hidden">
              <div 
                className="h-full bg-[#FF3C00] rounded-full transition-all"
                style={{ width: `${(totalCalories / 500) * 100}%` }}
              />
            </div>
            <div className="text-xs text-[#999999] mt-2">Goal: 500 kcal</div>
          </div>
          
          {currentExerciseIndex < workoutData.length - 1 && (
            <div className="bg-[#1a1a1a] p-6 rounded-lg border border-[#2a2a2a] mb-6">
              <div className="text-sm text-[#999999] mb-4" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                UP NEXT
              </div>
              <div className="flex gap-4">
                <img 
                  src={workoutData[currentExerciseIndex + 1].image}
                  alt={workoutData[currentExerciseIndex + 1].name}
                  className="w-24 h-24 object-cover rounded-lg"
                />
                <div>
                  <h4 className="text-lg mb-1" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                    {workoutData[currentExerciseIndex + 1].name}
                  </h4>
                  <p className="text-sm text-[#999999]">
                    {workoutData[currentExerciseIndex + 1].sets} sets × {workoutData[currentExerciseIndex + 1].reps}
                  </p>
                </div>
              </div>
            </div>
          )}
          
          <div className="flex-1 overflow-hidden">
            <div className="text-sm text-[#999999] mb-4" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              WORKOUT PROGRESS
            </div>
            <div className="space-y-3 overflow-y-auto" style={{ maxHeight: 'calc(100% - 30px)' }}>
              {workoutData.map((exercise, index) => (
                <div 
                  key={exercise.id}
                  className={`p-4 rounded-lg border transition-all ${
                    index === currentExerciseIndex
                      ? 'bg-[#FF3C00] bg-opacity-10 border-[#FF3C00]'
                      : index < currentExerciseIndex
                        ? 'bg-[#1a1a1a] border-[#5EE8C0] opacity-60'
                        : 'bg-[#1a1a1a] border-[#2a2a2a]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm mb-1" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                        {exercise.name}
                      </div>
                      <div className="text-xs text-[#999999]">
                        {exercise.sets} × {exercise.reps}
                      </div>
                    </div>
                    {index < currentExerciseIndex && (
                      <div className="w-6 h-6 rounded-full bg-[#5EE8C0] flex items-center justify-center">
                        <svg className="w-4 h-4 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                    {index === currentExerciseIndex && (
                      <div className="text-sm" style={{ fontFamily: 'Space Grotesk, sans-serif', color: '#FF3C00' }}>
                        IN PROGRESS
                      </div>
                    )}
                  </div>
                  {index === currentExerciseIndex && (
                    <div className="mt-3 h-1.5 bg-[#2a2a2a] rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-[#FF3C00] rounded-full transition-all"
                        style={{ width: `${(currentSet / exercise.sets) * 100}%` }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      {/* Bottom Bar */}
      <div className="h-24 flex-shrink-0 border-t border-[#2a2a2a] flex items-center justify-center gap-6 px-8">
        <button
          onClick={() => setIsPaused(!isPaused)}
          className="w-16 h-16 rounded-full border-2 border-[#5EE8C0] flex items-center justify-center hover:bg-[#5EE8C0] hover:bg-opacity-10 transition-all"
        >
          {isPaused ? (
            <Play className="w-7 h-7 text-[#5EE8C0]" />
          ) : (
            <Pause className="w-7 h-7 text-[#5EE8C0]" />
          )}
        </button>
        
        <button
          onClick={() => {
            if (currentSet < currentExercise.sets) {
              setCurrentSet(prev => prev + 1);
              setTimer(0);
            }
          }}
          disabled={currentSet >= currentExercise.sets}
          className="px-10 py-4 bg-[#5EE8C0] text-black rounded-full hover:bg-opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ fontFamily: 'Space Grotesk, sans-serif' }}
        >
          NEXT SET
        </button>
        
        <button
          onClick={handleNextExercise}
          disabled={currentExerciseIndex >= workoutData.length - 1}
          className="px-8 py-4 border-2 border-[#5EE8C0] text-[#5EE8C0] rounded-full hover:bg-[#5EE8C0] hover:text-black transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ fontFamily: 'Space Grotesk, sans-serif' }}
        >
          NEXT EXERCISE
        </button>
        
        <button
          onClick={handleSkip}
          disabled={currentExerciseIndex >= workoutData.length - 1}
          className="w-16 h-16 rounded-full border-2 border-[#999999] flex items-center justify-center hover:border-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <SkipForward className="w-7 h-7 text-[#999999]" />
        </button>
      </div>
      </div>
    </div>
  );
}

export default App;