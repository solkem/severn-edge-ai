# Understanding Neural Networks: From Math to Magic ✨

This document explains how neural networks actually work, why we built our own inference engine instead of using TensorFlow Lite, and what your 5th graders are really doing when they train and deploy models!

---

## Table of Contents

1. [What is a Neural Network?](#what-is-a-neural-network)
2. [The Math Behind the Magic](#the-math-behind-the-magic)
3. [What is TensorFlow Lite?](#what-is-tensorflow-lite)
4. [Why We Built Our Own](#why-we-built-our-own)
5. [How Our Simple Neural Network Works](#how-our-simple-neural-network-works)
6. [Glossary for Students](#glossary-for-students)

---

## What is a Neural Network?

A neural network is a computer program that learns patterns from examples - just like how you learned to recognize a dog by seeing many dogs!

### The Basic Idea

Imagine you're trying to teach a friend to recognize different hand gestures:

1. **You show them examples**: "This is a wave, this is a shake, this is a circle"
2. **They look for patterns**: "Waves go side-to-side, shakes go up-and-down"
3. **They make rules**: "If it moves side-to-side → probably a wave"
4. **They test and improve**: "Oops, that was wrong. Let me adjust my rules"

Neural networks do the same thing, but with math!

### Neurons: The Building Blocks

A "neuron" in a neural network is just a math formula:

```
output = (input₁ × weight₁) + (input₂ × weight₂) + ... + bias
```

That's it! Each neuron:
1. Takes some inputs (numbers)
2. Multiplies each input by a "weight" (how important is this input?)
3. Adds them all together
4. Adds a "bias" (a starting point adjustment)
5. Produces one output number

### Layers: Neurons Working Together

We stack neurons into "layers":

```
INPUT LAYER          HIDDEN LAYER         OUTPUT LAYER
(sensor data)        (finds patterns)     (makes decision)

  [ax] ────┐
  [ay] ────┼──→ [neuron 1] ──┐
  [az] ────┤    [neuron 2] ──┼──→ [Wave?]
  [gx] ────┼──→ [neuron 3] ──┤    [Shake?]
  [gy] ────┤    [neuron 4] ──┼──→ [Circle?]
  [gz] ────┘         ↓       │
                 (patterns)  └──→ (decision!)
```

---

## The Math Behind the Magic

### Step 1: Matrix Multiplication

When we have many inputs and many neurons, we use "matrix multiplication" - a fast way to do lots of multiplications at once.

**Example with 3 inputs and 2 neurons:**

```
Inputs: [0.5, 0.3, 0.8]

Weights Matrix:        Bias:
┌─────────────────┐    ┌─────┐
│ 0.2   0.4   0.1 │    │ 0.1 │  → Neuron 1
│ 0.5  -0.2   0.3 │    │ 0.2 │  → Neuron 2
└─────────────────┘    └─────┘

Calculation for Neuron 1:
  (0.5 × 0.2) + (0.3 × 0.4) + (0.8 × 0.1) + 0.1
= 0.1 + 0.12 + 0.08 + 0.1
= 0.4

Calculation for Neuron 2:
  (0.5 × 0.5) + (0.3 × -0.2) + (0.8 × 0.3) + 0.2
= 0.25 - 0.06 + 0.24 + 0.2
= 0.63

Output: [0.4, 0.63]
```

### Step 2: Activation Functions

After the math, we apply an "activation function" to decide if the neuron should "fire" (be active).

**ReLU (Rectified Linear Unit)** - The simplest:
```
if (value > 0) → keep it
if (value ≤ 0) → make it 0
```

Why? This helps the network learn complex patterns by ignoring "negative" signals.

**Softmax** - For the final decision:
```
Converts numbers into probabilities that add up to 100%

Raw outputs: [2.0, 1.0, 0.5]
After softmax: [64%, 24%, 12%]  ← Now we can say "64% confident it's gesture 1"
```

### Step 3: Learning (Training)

When training, the network:
1. Makes a prediction
2. Checks if it's right or wrong
3. Adjusts the weights slightly to be more correct next time
4. Repeats thousands of times!

The "100% accuracy" you saw means: after training, the network correctly classified all the training examples.

---

## What is TensorFlow Lite?

TensorFlow Lite (TFLite) is a **runtime** - a program that executes neural network operations.

### What TFLite Actually Does

Under the hood, TFLite is doing exactly what we described above:
- **Matrix multiplications** (inputs × weights)
- **Activation functions** (ReLU, softmax)
- **Reading weights from memory**

TFLite is essentially a **convenience wrapper** with optimizations. It:
1. Reads a `.tflite` file (contains weights + network structure)
2. Parses the file format (FlatBuffers)
3. Runs the math operations
4. Returns the output

### The TFLite Format Problem

TFLite uses a special file format called "FlatBuffers" that:
- Is optimized for mobile/embedded devices
- Requires Python + TensorFlow to create
- Cannot be generated in a web browser

This is why your web app couldn't directly upload to the Arduino!

---

## Why We Built Our Own

### The Problem

```
TensorFlow.js (browser) ──✗──→ TFLite Micro (Arduino)
        ↑                              ↑
   Different format!           Needs .tflite file!
```

TensorFlow.js models in the browser use JSON + binary weights.
TFLite Micro needs FlatBuffer format.
Converting between them requires Python - can't do it in a browser!

### Our Solution

Instead of using TFLite, we wrote our own simple inference engine:

```
TensorFlow.js (browser) ──→ Raw Weights ──→ Simple NN (Arduino)
        ↑                        ↑                  ↑
   Trains model           Just numbers!      Our own math!
```

### Why This is Better for Education

| TFLite Approach | Our Approach |
|-----------------|--------------|
| "Magic black box" loads model | Students see the actual math |
| Complex file format | Simple array of numbers |
| Hard to understand | Every line is readable |
| Requires external tools | Works entirely in browser + Arduino |

**The model trained in TensorFlow.js is REAL.**
**The weights learned during training are REAL.**
**We're just running them through explicit code instead of a framework.**

This is how machine learning was done before frameworks existed - and it's still how many embedded/edge AI systems work today!

---

## How Our Simple Neural Network Works

### The Architecture

We use a simple 3-layer network:

```
INPUT (600 values)     HIDDEN (32 neurons)     OUTPUT (3 classes)
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ 100 samples ×   │    │                 │    │                 │
│ 6 axes =        │───→│  32 neurons     │───→│  Wave           │
│ 600 numbers     │    │  with ReLU      │    │  Shake          │
│                 │    │                 │    │  Circle         │
└─────────────────┘    └─────────────────┘    └─────────────────┘
     (flatten)              (dense)               (softmax)
```

### The Code (Simplified)

```cpp
// Layer 1: Input → Hidden
for (int neuron = 0; neuron < 32; neuron++) {
    float sum = hidden_bias[neuron];
    
    for (int input = 0; input < 600; input++) {
        sum += input_data[input] * hidden_weights[neuron][input];
    }
    
    // ReLU activation
    hidden_output[neuron] = (sum > 0) ? sum : 0;
}

// Layer 2: Hidden → Output
for (int class_idx = 0; class_idx < num_classes; class_idx++) {
    float sum = output_bias[class_idx];
    
    for (int neuron = 0; neuron < 32; neuron++) {
        sum += hidden_output[neuron] * output_weights[class_idx][neuron];
    }
    
    output[class_idx] = sum;
}

// Softmax: Convert to probabilities
softmax(output, num_classes);

// Find the winner!
int prediction = argmax(output, num_classes);
```

### What Gets Uploaded via Bluetooth

When students train a model and click "Upload to Arduino", we send:
1. **Hidden layer weights**: 32 neurons × 600 inputs = 19,200 numbers
2. **Hidden layer biases**: 32 numbers
3. **Output layer weights**: 3 classes × 32 = 96 numbers
4. **Output layer biases**: 3 numbers
5. **Class labels**: "Wave", "Shake", "Circle"

Total: ~77 KB of data (stored as float32)

---

## Glossary for Students

| Term | Simple Explanation |
|------|-------------------|
| **Neural Network** | A computer program that learns patterns from examples |
| **Neuron** | A math formula: multiply, add, decide |
| **Weight** | How important an input is (learned during training) |
| **Bias** | A starting point adjustment (also learned) |
| **Layer** | A group of neurons working together |
| **Training** | Showing examples and adjusting weights to be more accurate |
| **Inference** | Using the trained network to make predictions |
| **ReLU** | "If negative, make it zero" - helps learn complex patterns |
| **Softmax** | Converts raw numbers into percentages that add to 100% |
| **Matrix Multiplication** | A fast way to do many multiplications at once |
| **TensorFlow** | A popular library for building neural networks |
| **TFLite** | TensorFlow Lite - a runtime for running models on small devices |
| **Weights File** | The "brain" of the network - all the learned numbers |

---

## Fun Facts for Students 🧠

1. **Your brain has ~86 billion neurons.** Our Arduino network has 35. But it can still recognize gestures!

2. **The first neural network was invented in 1958** - before the internet, before cell phones, before your parents were born!

3. **"Deep learning" just means** a neural network with many layers. Ours has 2 layers (hidden + output), so it's a "shallow" network.

4. **The weights are just numbers.** A trained model is really just a big list of decimal numbers like 0.2847, -0.1923, 0.5512...

5. **Training is like practicing.** The more examples you show, the better the network gets - just like practicing a sport!

---

## Questions to Ask Students

1. "What would happen if all the weights were zero?"
2. "Why do we need a hidden layer? What patterns might it find?"
3. "What happens if we train with only 2 examples per gesture instead of 10?"
4. "How is a neural network similar to how you learn new things?"

---

*Document created for the Severn Edge AI project - teaching machine learning through hands-on experimentation!*
